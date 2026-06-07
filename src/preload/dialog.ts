import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, ImageAttachment } from '../shared/types'

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
  onInit: (cb: (payload: DialogInitPayload) => void) => {
    ipcRenderer.on('dialog:init', (_e, payload) => cb(payload))
  },
  onMessage: (cb: (data: { sessionId: string; message: ChatMessage }) => void) => {
    ipcRenderer.on('dialog:message', (_e, data) => cb(data))
  },
  chat: (sessionId: string, message: string, attachments?: ImageAttachment[]) =>
    ipcRenderer.invoke('dialog:chat', sessionId, message, attachments) as Promise<{
      reply: string
      usedMcpTools: string[]
    }>
})
