import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('configApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (partial: unknown) => ipcRenderer.invoke('config:save', partial),
  testLlm: () => ipcRenderer.invoke('llm:test'),
  listHistory: () => ipcRenderer.invoke('history:list')
})
