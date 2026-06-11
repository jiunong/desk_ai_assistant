import { app, ipcMain, Menu, Tray, nativeImage } from 'electron'

import { join } from 'path'

import { AppConfig, DEFAULT_CONFIG } from '../shared/types'

import { startConfigServer, stopConfigServer } from './config-server'

import { loadConfig, saveConfig, initSkillsFromBundle } from './services/config-store'

import { AnalysisService } from './services/analysis'

import { listHistory, clearHistory } from './services/memory'

import { mcpManager } from './services/mcp-manager'

import { skillManager } from './services/skill-manager'

import { LlmService } from './services/llm'
import { saveTempFiles } from './services/temp-files'
import { previewFile } from './services/file-preview'
import { shortcutManager } from './services/shortcut-manager'
import { holdToTalkManager } from './services/hold-to-talk-manager'
import { isScreenshotActive, startScreenshotCapture } from './services/screenshot'

import {
  createPetWindow,
  destroyPetWindowForQuit,
  getPetWindow,
  getDialogWindowFromSender,
  destroyAllDialogWindowsForQuit,
  getOpenDialogCount,
  hidePetWindow,
  isPetWindowVisible,
  showDialogWindow,
  showPetWindow,
  showConfigWindow,
  sendPetState,
  sendPetError,
  sendToDialogSession,
  resizePetWindow,
  setPetVisibilityListener,
  destroyConfigWindowForQuit,
  attachFilesToActiveDialog,
  setInputTextToActiveDialog,
  hasOpenDialog
} from './windows'



let tray: Tray | null = null

let config: AppConfig

let analysisService: AnalysisService



function broadcastPetConfig(): void {
  getPetWindow()?.webContents.send('pet:configUpdated', {
    name: config.pet.name,
    size: config.pet.size,
    asr: config.asr
  })
}



function applyConfig(newConfig: AppConfig): void {

  config = newConfig

  analysisService.updateConfig(config)

  void analysisService.refreshMcp()

  resizePetWindow(config)

  broadcastPetConfig()

  applyShortcuts()

  holdToTalkManager.apply(config)

}



function handleOpenDirectChat(
  pendingFilePaths?: string[],
  pendingInputText?: string,
  autoSendInput?: boolean
): Promise<void> {
  sendPetState('talking')
  const { sessionId, welcome } = analysisService.openDirectChat()
  const index = getOpenDialogCount() + 1
  return showDialogWindow({
    sessionId,
    title: index > 1 ? `与小智对话 #${index}` : '与小智对话',
    messages: [{ role: 'assistant', content: welcome, createdAt: new Date().toISOString() }],
    fileNames: [],
    meta: {},
    ...(pendingFilePaths?.length ? { pendingFilePaths } : {}),
    ...(pendingInputText ? { pendingInputText } : {}),
    ...(autoSendInput ? { autoSendInput: true } : {})
  }).then(() => {})
}

async function ensureDialogForVoice(): Promise<void> {
  sendPetState('talking')
  if (hasOpenDialog()) return
  await handleOpenDirectChat()
}

async function handleVoiceInputUpdate(text: string, final: boolean): Promise<void> {
  sendPetState('talking')
  if (!hasOpenDialog()) {
    await handleOpenDirectChat()
  }
  setInputTextToActiveDialog(text, final)
}

function deliverScreenshotToDialog(filePath: string, text?: string): void {
  if (attachFilesToActiveDialog([filePath], text)) return
  handleOpenDirectChat([filePath], text)
}

function handleScreenshot(): void {
  if (isScreenshotActive()) return

  startScreenshotCapture(
    (filePath, text) => deliverScreenshotToDialog(filePath, text),
    (msg) => sendPetError(msg)
  )
}

function applyShortcuts(): void {
  shortcutManager.apply(config, {
    openConfig: () => showConfigWindow(config),
    openChat: () => handleOpenDirectChat(),
    screenshot: () => handleScreenshot(),
    togglePet: () => {
      if (isPetWindowVisible()) {
        hidePetWindow()
      } else {
        showPetWindow(config)
      }
      refreshTrayMenu()
    }
  })
}

async function handleFileDrop(filePaths: string[], userPrompt?: string): Promise<void> {
  if (!filePaths.length) {
    sendPetError('未获取到文件路径，请从资源管理器拖入文件')
    return
  }

  sendPetState('eating')
  await new Promise((r) => setTimeout(r, 800))
  sendPetState('thinking')

  let sessionId = ''

  try {
    const result = await analysisService.analyze(
      { filePaths, userPrompt },
      {
        onPrepared: async (info) => {
          sessionId = info.sessionId
          await showDialogWindow({
            sessionId: info.sessionId,
            title: info.title,
            messages: info.messages,
            fileNames: info.fileNames,
            meta: info.meta
          })
          sendPetState('talking')
        },
        onChunk: (delta) => {
          sendToDialogSession(sessionId, 'dialog:chatStream', { sessionId, delta })
        }
      }
    )

    sendToDialogSession(result.sessionId, 'dialog:streamEnd', {
      sessionId: result.sessionId,
      reply: result.reply,
      usedMcpTools: result.usedMcpTools,
      usedSkills: result.usedSkills
    })
  } catch (err) {
    sendPetState('idle')
    const msg = err instanceof Error ? err.message : String(err)
    sendPetError(msg)

    if (sessionId) {
      sendToDialogSession(sessionId, 'dialog:streamEnd', {
        sessionId,
        error: msg
      })
    } else {
      await showDialogWindow({
        sessionId: '',
        title: '分析失败',
        messages: [{ role: 'assistant', content: msg, createdAt: new Date().toISOString() }],
        fileNames: []
      })
    }
  }
}



function setupIpc(): void {

  ipcMain.handle('pet:dropFiles', async (_e, filePaths: string[], userPrompt?: string) => {
    await handleFileDrop(filePaths, userPrompt)
  })

  ipcMain.handle('pet:openChat', () => {
    handleOpenDirectChat()
  })



  ipcMain.handle('pet:getConfig', () => ({
    name: config.pet.name,
    size: config.pet.size,
    asr: config.asr
  }))

  ipcMain.handle('pet:ensureDialogForVoice', () => ensureDialogForVoice())

  ipcMain.handle('pet:updateVoiceInput', (_e, text: string, final: boolean) =>
    handleVoiceInputUpdate(text, final)
  )



  ipcMain.on('pet:moveWindow', (_e, deltaX: number, deltaY: number) => {

    const win = getPetWindow()

    if (!win) return

    const [x, y] = win.getPosition()

    win.setPosition(x + deltaX, y + deltaY)

  })



  ipcMain.on('dialog:close', (event) => {
    getDialogWindowFromSender(event.sender)?.close()
  })

  ipcMain.on('dialog:resizeWindow', (event, deltaW: number, deltaH: number) => {
    const win = getDialogWindowFromSender(event.sender)
    if (!win || win.isDestroyed()) return
    const [w, h] = win.getSize()
    const [minW, minH] = win.getMinimumSize()
    win.setSize(
      Math.max(minW || 480, w + Math.round(deltaW)),
      Math.max(minH || 400, h + Math.round(deltaH))
    )
  })



  ipcMain.handle('history:list', () => listHistory(50))

  ipcMain.handle('config:open', () => {
    showConfigWindow(config)
  })



  ipcMain.handle('config:get', () => config)

  ipcMain.handle('config:save', (_e, partial: Partial<AppConfig>) => {

    config = { ...config, ...partial, llm: { ...config.llm, ...partial.llm }, pet: { ...config.pet, ...partial.pet }, files: { ...config.files, ...partial.files }, memory: { ...config.memory, ...partial.memory }, mcp: partial.mcp ?? config.mcp, skills: partial.skills ?? config.skills, configServer: { ...config.configServer, ...partial.configServer }, shortcuts: { ...config.shortcuts, ...partial.shortcuts }, asr: { ...config.asr, ...partial.asr } }

    saveConfig(config)

    applyConfig(config)

    return config

  })



  ipcMain.handle('llm:test', async () => {

    const llm = new LlmService(config)

    return llm.testConnection()

  })

  ipcMain.handle('dialog:getSession', (_e, sessionId: string) => {
    return analysisService.getSession(sessionId)
  })

  ipcMain.handle(
    'dialog:saveTempFiles',
    (_e, files: import('./services/temp-files').TempFilePayload[]) => saveTempFiles(files)
  )

  ipcMain.handle(
    'dialog:chat',
    async (event, sessionId: string, message: string, filePaths?: string[]) => {
      sendPetState('thinking')
      try {
        const result = await analysisService.continueChat(
          sessionId,
          message,
          filePaths,
          (delta) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('dialog:chatStream', { sessionId, delta })
            }
          }
        )
        sendPetState('talking')
        return result
      } catch (err) {
        sendPetState('talking')
        throw err
      }
    }
  )

  ipcMain.handle('dialog:getAsrConfig', () => config.asr)

  ipcMain.handle('dialog:resolveAttachmentPath', (_e, sessionId: string, fileName: string) => {
    return analysisService.resolveAttachmentPath(sessionId, fileName)
  })

  ipcMain.handle('dialog:previewFile', (_e, filePath: string) => {
    return previewFile(filePath)
  })

  ipcMain.handle('dialog:takeScreenshot', () => {
    return new Promise<{ ok: boolean; error?: string; cancelled?: boolean }>((resolve) => {
      if (isScreenshotActive()) {
        resolve({ ok: false, error: '截图进行中，请稍候' })
        return
      }

      startScreenshotCapture(
        (filePath, text) => {
          if (attachFilesToActiveDialog([filePath], text)) {
            resolve({ ok: true })
          } else {
            resolve({ ok: false, error: '未找到可用的对话窗口' })
          }
        },
        (msg) => resolve({ ok: false, error: msg }),
        () => resolve({ ok: false, cancelled: true })
      )
    })
  })
}



function buildTrayMenu(): Menu {
  const petVisible = isPetWindowVisible()

  return Menu.buildFromTemplate([
    petVisible
      ? { label: '隐藏宠物', click: () => { hidePetWindow(); refreshTrayMenu() } }
      : { label: '显示宠物', click: () => { showPetWindow(config); refreshTrayMenu() } },
    { label: '开始对话', click: () => handleOpenDirectChat() },
    { label: '打开配置页', click: () => showConfigWindow(config) },
    { type: 'separator' },
    { label: '清空历史', click: () => clearHistory() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildTrayMenu())
}

function createTray(): void {
  const iconPath = join(__dirname, '../resources/icon.png')

  let icon = nativeImage.createFromPath(iconPath)

  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    )
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Desk AI Assistant')
  refreshTrayMenu()
  tray.on('double-click', () => showConfigWindow(config))
}



app.whenReady().then(async () => {

  initSkillsFromBundle()

  config = loadConfig()

  if (!config.pet.skin) config.pet.skin = 'cat'

  if (config.llm.enableMcpTools === undefined) config.llm.enableMcpTools = true

  if (!config.shortcuts) {
    config.shortcuts = { ...DEFAULT_CONFIG.shortcuts }
  }

  if (!config.asr) {
    config.asr = { ...DEFAULT_CONFIG.asr }
  } else {
    config.asr = { ...DEFAULT_CONFIG.asr, ...config.asr }
  }

  if (config.skills.enabled.length === 0) {

    config.skills.enabled = ['doc-summarize', 'doc-compare']

    saveConfig(config)

  }



  analysisService = new AnalysisService(config)

  await analysisService.refreshMcp()



  setupIpc()

  startConfigServer(() => config, applyConfig)

  setPetVisibilityListener(refreshTrayMenu)

  createPetWindow(config)

  createTray()

  applyShortcuts()

  holdToTalkManager.apply(config)

})



app.on('window-all-closed', () => {
  // 保持托盘常驻，仅通过托盘「退出」或手动隐藏关闭宠物
})



app.on('before-quit', async () => {
  shortcutManager.unregisterAll()
  holdToTalkManager.shutdown()
  destroyPetWindowForQuit()
  destroyAllDialogWindowsForQuit()
  destroyConfigWindowForQuit()
  skillManager.stopWatch()
  stopConfigServer()
  await mcpManager.shutdown()
})

