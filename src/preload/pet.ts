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
  getConfig: () => ipcRenderer.invoke('pet:getConfig'),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('pet:moveWindow', dx, dy),
  onSetState: (cb: (state: string) => void) => {
    ipcRenderer.on('pet:setState', (_e, state) => cb(state))
  },
  onError: (cb: (msg: string) => void) => {
    ipcRenderer.on('pet:error', (_e, msg) => cb(msg))
  },
  onConfigUpdated: (cb: (config: { name: string; size: number }) => void) => {
    ipcRenderer.on('pet:configUpdated', (_e, config) => cb(config))
  },
  openConfig: () => ipcRenderer.invoke('config:open')
})
