export type PetSkin = 'cat' | 'fox' | 'robot'
export type PetState = 'idle' | 'dragging' | 'eating' | 'thinking' | 'talking'

export interface PetApi {
  resolvePaths: (files: File[]) => string[]
  dropFiles: (paths: string[], prompt?: string) => Promise<void>
  openChat: () => Promise<void>
  sendVoiceText: (text: string) => Promise<void>
  getConfig: () => Promise<{ name: string; size: number; asr: import('./types').AppConfig['asr'] }>
  moveWindow: (dx: number, dy: number) => void
  onSetState: (cb: (state: PetState) => void) => void
  onError: (cb: (msg: string) => void) => void
  onConfigUpdated: (
    cb: (config: { name: string; size: number; asr: import('./types').AppConfig['asr'] }) => void
  ) => void
  onVoiceHold: (cb: (data: { action: 'down' | 'up' | 'cancel' }) => void) => () => void
  openConfig: () => Promise<void>
}

export interface DialogInitPayload {
  sessionId: string
  title: string
  messages: import('./types').ChatMessage[]
  fileNames: string[]
  meta?: { usedSkills?: string[]; usedMcpTools?: string[] }
  pendingFilePaths?: string[]
  pendingInputText?: string
  autoSendInput?: boolean
}

export interface DialogApi {
  close: () => void
  resizeWindow: (deltaW: number, deltaH: number) => void
  resolvePaths: (files: File[]) => string[]
  saveTempFiles: (files: { name: string; data: string }[]) => Promise<string[]>
  onInit: (cb: (payload: DialogInitPayload) => void) => () => void
  onMessage: (cb: (data: { sessionId: string; message: import('./types').ChatMessage }) => void) => () => void
  onChatStream: (cb: (data: { sessionId: string; delta: string }) => void) => () => void
  onStreamEnd: (
    cb: (data: {
      sessionId: string
      reply?: string
      error?: string
      usedMcpTools?: string[]
      usedSkills?: string[]
    }) => void
  ) => () => void
  onAttachFiles: (cb: (data: { filePaths: string[]; inputText?: string }) => void) => () => void
  onSendText: (cb: (data: { text: string }) => void) => () => void
  onVoiceHold: (cb: (data: { action: 'down' | 'up' | 'cancel' }) => void) => () => void
  getAsrConfig: () => Promise<import('./types').AppConfig['asr']>
  takeScreenshot: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean }>
  previewFile: (filePath: string) => Promise<
    | { ok: true; kind: 'image'; name: string; dataUrl: string; size: number }
    | { ok: true; kind: 'text'; name: string; text: string; truncated: boolean; size: number }
    | { ok: true; kind: 'unsupported'; name: string; size: number; extension: string }
    | { ok: false; error: string }
  >
  resolveAttachmentPath: (sessionId: string, fileName: string) => Promise<string | null>
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
