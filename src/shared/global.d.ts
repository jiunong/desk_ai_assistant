export type PetSkin = 'cat' | 'fox' | 'robot'
export type PetState = 'idle' | 'dragging' | 'eating' | 'thinking' | 'talking'

export interface PetApi {
  resolvePaths: (files: File[]) => string[]
  dropFiles: (paths: string[], prompt?: string) => Promise<void>
  openChat: () => Promise<void>
  getConfig: () => Promise<{ name: string; size: number }>
  moveWindow: (dx: number, dy: number) => void
  onSetState: (cb: (state: PetState) => void) => void
  onError: (cb: (msg: string) => void) => void
  onConfigUpdated: (cb: (config: { name: string; size: number }) => void) => void
  openConfig: () => Promise<void>
}

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: import('./types').ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
}

export interface DialogApi {
  close: () => void
  resizeWindow: (deltaW: number, deltaH: number) => void
  resolvePaths: (files: File[]) => string[]
  saveTempFiles: (files: { name: string; data: string }[]) => Promise<string[]>
  onInit: (cb: (payload: DialogInitPayload) => void) => void
  onMessage: (cb: (data: { sessionId: string; message: import('./types').ChatMessage }) => void) => void
  chat: (
    sessionId: string,
    message: string,
    filePaths?: string[]
  ) => Promise<{ reply: string; usedMcpTools: string[]; fileNames: string[] }>
}

export interface ConfigApi {
  getConfig: () => Promise<import('./types').AppConfig>
  saveConfig: (partial: Partial<import('./types').AppConfig>) => Promise<import('./types').AppConfig>
  testLlm: () => Promise<{ ok: boolean; message: string }>
  listHistory: () => Promise<unknown[]>
}

declare global {
  interface Window {
    petApi: PetApi
    dialogApi: DialogApi
    configApi: ConfigApi
  }
}

export {}
