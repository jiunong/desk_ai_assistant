import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen
} from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

export type ScreenshotBounds = {
  x: number
  y: number
  width: number
  height: number
}

let overlayWindow: BrowserWindow | null = null
let captureInProgress = false

function preloadPath(name: string): string {
  return join(__dirname, '../preload', `${name}.js`)
}

function closeOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function saveDataUrlToTemp(dataUrl: string): string {
  const path = join(tmpdir(), `desk-ai-screenshot-${uuidv4()}.png`)
  const image = nativeImage.createFromDataURL(dataUrl)
  writeFileSync(path, image.toPNG())
  return path
}

async function captureRegion(bounds: ScreenshotBounds): Promise<string> {
  const normalized = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height))
  }

  const display = screen.getDisplayMatching(normalized)
  const { width, height } = display.size
  const scaleFactor = display.scaleFactor

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scaleFactor),
      height: Math.round(height * scaleFactor)
    }
  })

  const source =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0]

  if (!source) {
    throw new Error('无法获取屏幕源，请检查系统截图权限')
  }

  const fullImage = nativeImage.createFromDataURL(source.thumbnail.toDataURL())
  const cropX = Math.round((normalized.x - display.bounds.x) * scaleFactor)
  const cropY = Math.round((normalized.y - display.bounds.y) * scaleFactor)
  const cropW = Math.round(normalized.width * scaleFactor)
  const cropH = Math.round(normalized.height * scaleFactor)

  const cropped = fullImage.crop({
    x: Math.max(0, cropX),
    y: Math.max(0, cropY),
    width: Math.min(cropW, fullImage.getSize().width - cropX),
    height: Math.min(cropH, fullImage.getSize().height - cropY)
  })

  return cropped.toDataURL()
}

export type ScreenshotSendPayload = {
  dataUrl: string
  text?: string
}

export function isScreenshotActive(): boolean {
  return captureInProgress
}

export function startScreenshotCapture(
  onComplete: (filePath: string, text?: string) => void,
  onError: (message: string) => void,
  onCancel?: () => void
): void {
  if (captureInProgress) return
  captureInProgress = true

  const displays = screen.getAllDisplays()
  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))

  closeOverlay()

  overlayWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: preloadPath('screenshot'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  const finish = (): void => {
    captureInProgress = false
    closeOverlay()
  }

  const cleanupListeners = (): void => {
    ipcMain.removeListener('screenshot:complete', handleComplete)
    ipcMain.removeListener('screenshot:send', handleSend)
    ipcMain.removeListener('screenshot:cancel', handleCancel)
  }

  const handleComplete = async (_e: Electron.IpcMainEvent, bounds: ScreenshotBounds) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    overlayWindow.webContents.send('screenshot:capturing')

    await new Promise((r) => setTimeout(r, 120))

    try {
      const dataUrl = await captureRegion(bounds)
      if (!overlayWindow || overlayWindow.isDestroyed()) return
      overlayWindow.webContents.send('screenshot:preview', { dataUrl, bounds })
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
      cleanupListeners()
      finish()
    }
  }

  const handleSend = (_e: Electron.IpcMainEvent, payload: ScreenshotSendPayload) => {
    cleanupListeners()
    try {
      if (!payload?.dataUrl) {
        onError('截图数据无效')
        finish()
        return
      }
      const filePath = saveDataUrlToTemp(payload.dataUrl)
      onComplete(filePath, payload.text?.trim() || undefined)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      finish()
    }
  }

  const handleCancel = () => {
    cleanupListeners()
    onCancel?.()
    finish()
  }

  ipcMain.on('screenshot:complete', handleComplete)
  ipcMain.on('screenshot:send', handleSend)
  ipcMain.on('screenshot:cancel', handleCancel)

  overlayWindow.once('closed', () => {
    overlayWindow = null
    cleanupListeners()
    captureInProgress = false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/screenshot/index.html`)
  } else {
    void overlayWindow.loadFile(join(__dirname, '../renderer/screenshot/index.html'))
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show()
    overlayWindow?.focus()
  })
}
