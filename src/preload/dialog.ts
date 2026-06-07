import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ChatMessage } from '../shared/types'

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
}

contextBridge.exposeInMainWorld('dialogApi', {
  close: () => ipcRenderer.send('dialog:close'),
  resizeWindow: (deltaW: number, deltaH: number) =>
    ipcRenderer.send('dialog:resizeWindow', deltaW, deltaH),
  saveTempFiles: (files: { name: string; data: string }[]) =>
    ipcRenderer.invoke('dialog:saveTempFiles', files) as Promise<string[]>,
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
  onInit: (cb: (payload: DialogInitPayload) => void) => {
    ipcRenderer.on('dialog:init', (_e, payload) => cb(payload))
  },
  onMessage: (cb: (data: { sessionId: string; message: ChatMessage }) => void) => {
    ipcRenderer.on('dialog:message', (_e, data) => cb(data))
  },
  chat: (sessionId: string, message: string, filePaths?: string[]) =>
    ipcRenderer.invoke('dialog:chat', sessionId, message, filePaths) as Promise<{
      reply: string
      usedMcpTools: string[]
      fileNames: string[]
    }>
})
