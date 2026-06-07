import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { AppConfig, ChatMessage } from '../../shared/types'
import { getConfigPageUrl } from './config-server'
import { getPetWindowSize } from './pet-window'

let petWindow: BrowserWindow | null = null
let dialogWindow: BrowserWindow | null = null
let configWindow: BrowserWindow | null = null
let petAllowClose = false
let onPetVisibilityChange: (() => void) | null = null

export function setPetVisibilityListener(listener: () => void): void {
  onPetVisibilityChange = listener
}

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
}

function preloadPath(name: string): string {
  return join(__dirname, '../preload', `${name}.js`)
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

export function getDialogWindow(): BrowserWindow | null {
  return dialogWindow
}

export function showDialogWindow(payload: DialogInitPayload): BrowserWindow {
  if (dialogWindow && !dialogWindow.isDestroyed()) {
    dialogWindow.close()
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  dialogWindow = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 480,
    minHeight: 400,
    x: Math.round((width - 760) / 2),
    y: Math.round((height - 820) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
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
    dialogWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/dialog/index.html?${params}`)
  } else {
    dialogWindow.loadFile(join(__dirname, '../renderer/dialog/index.html'), {
      query: Object.fromEntries(params)
    })
  }

  dialogWindow.webContents.once('did-finish-load', () => {
    dialogWindow?.webContents.send('dialog:init', payload)
  })

  dialogWindow.on('closed', () => {
    dialogWindow = null
    getPetWindow()?.webContents.send('pet:setState', 'idle')
  })

  return dialogWindow
}

export function sendPetState(state: string): void {
  petWindow?.webContents.send('pet:setState', state)
}

export function sendPetError(message: string): void {
  petWindow?.webContents.send('pet:error', message)
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
