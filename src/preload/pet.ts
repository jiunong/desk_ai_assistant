import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('petApi', {
  resolvePaths: (files: File[]) => {
    const paths: string[] = []
    for (const file of files) {
      try {
        paths.push(webUtils.getPathForFile(file))
      } catch {
        // skip invalid file
      }
    }
    return paths
  },
  dropFiles: (paths: string[], prompt?: string) =>
    ipcRenderer.invoke('pet:dropFiles', paths, prompt),
  openChat: () => ipcRenderer.invoke('pet:openChat') as Promise<void>,
  sendVoiceText: (text: string) => ipcRenderer.invoke('pet:sendVoiceText', text) as Promise<void>,
  getConfig: () => ipcRenderer.invoke('pet:getConfig'),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('pet:moveWindow', dx, dy),
  onSetState: (cb: (state: string) => void) => {
    ipcRenderer.on('pet:setState', (_e, state) => cb(state))
  },
  onError: (cb: (msg: string) => void) => {
    ipcRenderer.on('pet:error', (_e, msg) => cb(msg))
  },
  onConfigUpdated: (
    cb: (config: { name: string; size: number; asr: import('../shared/types').AppConfig['asr'] }) => void
  ) => {
    ipcRenderer.on('pet:configUpdated', (_e, config) => cb(config))
  },
  onVoiceHold: (cb: (data: { action: 'down' | 'up' | 'cancel' }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { action: 'down' | 'up' | 'cancel' }) =>
      cb(data)
    ipcRenderer.on('pet:voiceHold', listener)
    return () => ipcRenderer.removeListener('pet:voiceHold', listener)
  },
  openConfig: () => ipcRenderer.invoke('config:open')
})
