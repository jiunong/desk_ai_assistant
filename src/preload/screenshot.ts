import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

function subscribe<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, data: T) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('screenshotApi', {
  complete: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.send('screenshot:complete', bounds),
  send: (payload: { dataUrl: string; text?: string }) => ipcRenderer.send('screenshot:send', payload),
  cancel: () => ipcRenderer.send('screenshot:cancel'),
  onPreview: (cb: (data: { dataUrl: string; bounds: { x: number; y: number; width: number; height: number } }) => void) =>
    subscribe('screenshot:preview', cb),
  onCapturing: (cb: () => void) => subscribe('screenshot:capturing', cb)
})
