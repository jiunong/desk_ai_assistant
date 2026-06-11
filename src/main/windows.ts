import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { AppConfig, ChatMessage } from '../../shared/types'
import { getConfigPageUrl } from './config-server'
import { getPetWindowSize } from './pet-window'

let petWindow: BrowserWindow | null = null
let configWindow: BrowserWindow | null = null
const dialogWindows = new Map<string, BrowserWindow>()
let lastFocusedDialogKey: string | null = null
let petAllowClose = false
let onPetVisibilityChange: (() => void) | null = null

const MAX_DIALOG_WINDOWS = 12

export function setPetVisibilityListener(listener: () => void): void {
  onPetVisibilityChange = listener
}

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
  pendingFilePaths?: string[]
  pendingInputText?: string
}

function preloadPath(name: string): string {
  return join(__dirname, '../preload', `${name}.js`)
}

function syncPetStateAfterDialogs(): void {
  if (dialogWindows.size === 0) {
    getPetWindow()?.webContents.send('pet:setState', 'idle')
  }
}

function attachPetWindowHandlers(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!petAllowClose) {
      event.preventDefault()
      win.hide()
      onPetVisibilityChange?.()
    }
  })

  win.on('closed', () => {
    petWindow = null
  })
}

export function createPetWindow(config: AppConfig): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show()
    petWindow.focus()
    return petWindow
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const { width: winW, height: winH } = getPetWindowSize(config.pet.size)

  petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: config.pet.startX,
    y: height - winH - 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath('pet'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  attachPetWindowHandlers(petWindow)
  petWindow.setIgnoreMouseEvents(false)

  if (process.env['ELECTRON_RENDERER_URL']) {
    petWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/pet/index.html`)
  } else {
    petWindow.loadFile(join(__dirname, '../renderer/pet/index.html'))
  }

  return petWindow
}

export function showPetWindow(config: AppConfig): void {
  createPetWindow(config).show()
}

export function hidePetWindow(): void {
  petWindow?.hide()
}

export function isPetWindowVisible(): boolean {
  return Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
}

export function destroyPetWindowForQuit(): void {
  petAllowClose = true
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.close()
  }
  petWindow = null
}

export function resizePetWindow(config: AppConfig): void {
  if (!petWindow || petWindow.isDestroyed()) return
  const { width, height } = getPetWindowSize(config.pet.size)
  petWindow.setSize(width, height)
}

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

export function getDialogWindowFromSender(sender: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender)
}

export function getOpenDialogCount(): number {
  return dialogWindows.size
}

export function showDialogWindow(payload: DialogInitPayload): Promise<BrowserWindow> {
  if (dialogWindows.size >= MAX_DIALOG_WINDOWS) {
    const oldestKey = dialogWindows.keys().next().value
    if (oldestKey) {
      dialogWindows.get(oldestKey)?.close()
    }
  }

  const windowKey =
    payload.sessionId || `dialog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const offset = (dialogWindows.size % 8) * 32
  const winX = Math.round((width - 760) / 2) + offset
  const winY = Math.round((height - 820) / 2) + offset

  const win = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 480,
    minHeight: 400,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
    thickFrame: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: preloadPath('dialog'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const params = new URLSearchParams({ sessionId: payload.sessionId, title: payload.title })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/dialog/index.html?${params}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/dialog/index.html'), {
      query: Object.fromEntries(params)
    })
  }

  dialogWindows.set(windowKey, win)

  win.on('focus', () => {
    lastFocusedDialogKey = windowKey
  })

  win.on('closed', () => {
    dialogWindows.delete(windowKey)
    syncPetStateAfterDialogs()
  })

  win.show()
  win.focus()

  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('dialog:init', payload)
      resolve(win)
    })
  })
}

export function sendToDialogSession(sessionId: string, channel: string, data: unknown): void {
  const win = dialogWindows.get(sessionId)
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

export function destroyAllDialogWindowsForQuit(): void {
  for (const win of dialogWindows.values()) {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }
  dialogWindows.clear()
}

export function sendPetState(state: string): void {
  petWindow?.webContents.send('pet:setState', state)
}

export function sendPetError(message: string): void {
  petWindow?.webContents.send('pet:error', message)
}

export function attachFilesToActiveDialog(
  filePaths: string[],
  inputText?: string
): boolean {
  if (!filePaths.length && !inputText) return false

  const payload = { filePaths, ...(inputText ? { inputText } : {}) }

  for (const win of dialogWindows.values()) {
    if (!win.isDestroyed() && win.isFocused()) {
      win.webContents.send('dialog:attachFiles', payload)
      win.show()
      win.focus()
      return true
    }
  }

  if (lastFocusedDialogKey) {
    const win = dialogWindows.get(lastFocusedDialogKey)
    if (win && !win.isDestroyed()) {
      win.webContents.send('dialog:attachFiles', payload)
      win.show()
      win.focus()
      return true
    }
  }

  const first = dialogWindows.values().next().value
  if (first && !first.isDestroyed()) {
    first.webContents.send('dialog:attachFiles', payload)
    first.show()
    first.focus()
    return true
  }

  return false
}

export function hasOpenDialog(): boolean {
  return dialogWindows.size > 0
}

export function showConfigWindow(config: AppConfig): void {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.show()
    configWindow.focus()
    return
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  configWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    x: Math.round((width - 960) / 2),
    y: Math.round((height - 720) / 2),
    title: 'Desk AI Assistant 设置',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath('config'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const configUrl = process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/config/`
    : getConfigPageUrl(config)

  void configWindow.loadURL(configUrl)
  configWindow.once('ready-to-show', () => {
    configWindow?.show()
    configWindow?.focus()
  })

  configWindow.on('closed', () => {
    configWindow = null
  })
}

export function destroyConfigWindowForQuit(): void {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.destroy()
  }
  configWindow = null
}
