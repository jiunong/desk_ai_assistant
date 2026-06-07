import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'

import { join } from 'path'

import { AppConfig } from '../shared/types'

import { startConfigServer, stopConfigServer } from './config-server'

import { loadConfig, saveConfig, initSkillsFromBundle } from './services/config-store'

import { AnalysisService } from './services/analysis'

import { listHistory, clearHistory } from './services/memory'

import { mcpManager } from './services/mcp-manager'

import { skillManager } from './services/skill-manager'

import { LlmService } from './services/llm'

import {
  createPetWindow,
  destroyPetWindowForQuit,
  getPetWindow,
  getDialogWindow,
  hidePetWindow,
  isPetWindowVisible,
  showDialogWindow,
  showPetWindow,
  showConfigWindow,
  sendPetState,
  sendPetError,
  resizePetWindow,
  setPetVisibilityListener,
  destroyConfigWindowForQuit
} from './windows'



let tray: Tray | null = null

let config: AppConfig

let analysisService: AnalysisService



function broadcastPetConfig(): void {
  getPetWindow()?.webContents.send('pet:configUpdated', {
    name: config.pet.name,
    size: config.pet.size
  })
}



function applyConfig(newConfig: AppConfig): void {

  config = newConfig

  analysisService.updateConfig(config)

  void analysisService.refreshMcp()

  resizePetWindow(config)

  broadcastPetConfig()

}



function handleOpenDirectChat(): void {
  sendPetState('talking')
  const { sessionId, welcome } = analysisService.openDirectChat()
  showDialogWindow({
    sessionId,
    title: '与小智对话',
    messages: [{ role: 'assistant', content: welcome, createdAt: new Date().toISOString() }],
    fileNames: [],
    meta: {}
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



  try {

    const result = await analysisService.analyze({ filePaths, userPrompt })

    sendPetState('talking')



    showDialogWindow({
      sessionId: result.sessionId,
      title: '分析结果',
      messages: analysisService.getSession(result.sessionId)?.messages ?? [
        { role: 'assistant', content: result.reply, createdAt: new Date().toISOString() }
      ],
      fileNames: result.files.map((f) => f.name),
      meta: { usedSkills: result.usedSkills, usedMcpTools: result.usedMcpTools }
    })

  } catch (err) {

    sendPetState('idle')

    const msg = err instanceof Error ? err.message : String(err)

    sendPetError(msg)

    showDialogWindow({
      sessionId: '',
      title: '分析失败',
      messages: [{ role: 'assistant', content: msg, createdAt: new Date().toISOString() }],
      fileNames: []
    })

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
    size: config.pet.size
  }))



  ipcMain.on('pet:moveWindow', (_e, deltaX: number, deltaY: number) => {

    const win = getPetWindow()

    if (!win) return

    const [x, y] = win.getPosition()

    win.setPosition(x + deltaX, y + deltaY)

  })



  ipcMain.on('dialog:close', () => {

    BrowserWindow.getAllWindows()

      .find((w) => w.webContents.getURL().includes('dialog'))

      ?.close()

  })

  ipcMain.on('dialog:resizeWindow', (_e, deltaW: number, deltaH: number) => {
    const win = getDialogWindow()
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

    config = { ...config, ...partial, llm: { ...config.llm, ...partial.llm }, pet: { ...config.pet, ...partial.pet }, files: { ...config.files, ...partial.files }, memory: { ...config.memory, ...partial.memory }, mcp: partial.mcp ?? config.mcp, skills: partial.skills ?? config.skills, configServer: { ...config.configServer, ...partial.configServer } }

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
    'dialog:chat',
    async (_e, sessionId: string, message: string, attachments?: import('../shared/types').ImageAttachment[]) => {
    sendPetState('thinking')
    try {
      const result = await analysisService.continueChat(sessionId, message, attachments)
      sendPetState('talking')
      return result
    } catch (err) {
      sendPetState('talking')
      throw err
    }
  }
  )
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

})



app.on('window-all-closed', () => {
  // 保持托盘常驻，仅通过托盘「退出」或手动隐藏关闭宠物
})



app.on('before-quit', async () => {
  destroyPetWindowForQuit()
  destroyConfigWindowForQuit()
  skillManager.stopWatch()
  stopConfigServer()
  await mcpManager.shutdown()
})

