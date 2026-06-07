import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { ChatMessage } from '../shared/types'

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
}

function subscribe<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, data: T) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('dialogApi', {  close: () => ipcRenderer.send('dialog:close'),
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
  onInit: (cb: (payload: DialogInitPayload) => void) => subscribe('dialog:init', cb),
  onMessage: (cb: (data: { sessionId: string; message: ChatMessage }) => void) =>
    subscribe('dialog:message', cb),
  onChatStream: (cb: (data: { sessionId: string; delta: string }) => void) =>
    subscribe('dialog:chatStream', cb),
  onStreamEnd: (
    cb: (data: {
      sessionId: string
      reply?: string
      error?: string
      usedMcpTools?: string[]
      usedSkills?: string[]
    }) => void
  ) => subscribe('dialog:streamEnd', cb),  chat: (sessionId: string, message: string, filePaths?: string[]) =>
    ipcRenderer.invoke('dialog:chat', sessionId, message, filePaths) as Promise<{
      reply: string
      usedMcpTools: string[]
      fileNames: string[]
    }>
})
