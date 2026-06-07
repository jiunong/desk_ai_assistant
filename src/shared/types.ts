export type PetSkin = 'cat' | 'fox' | 'robot'

export interface AppConfig {
  llm: {
    baseUrl: string
    apiKey: string
    model: string
    maxTokens: number
    temperature: number
    enableMcpTools: boolean
  }
  pet: {
    name: string
    size: number
    startX: number
    startY: number
    skin: PetSkin
  }
  files: {
    allowedExtensions: string[]
    maxFileSizeMb: number
    maxFilesPerDrop: number
  }
  memory: {
    maxHistoryItems: number
    contextWindowMessages: number
  }
  mcp: {
    servers: McpServerConfig[]
  }
  skills: {
    enabled: string[]
    directory: string
  }
  configServer: {
    port: number
  }
}

export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface HistoryItem {
  id: string
  createdAt: string
  files: string[]
  userPrompt: string
  assistantReply: string
  summary?: string
}

export interface AnalysisRequest {
  filePaths: string[]
  userPrompt?: string
}

export interface AnalysisResult {
  id: string
  sessionId: string
  reply: string
  files: ParsedFile[]
  usedSkills: string[]
  usedMcpTools: string[]
}

export interface ImageAttachment {
  name: string
  mimeType: string
  dataUrl: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** 图片附件（用于视觉模型） */
  attachments?: ImageAttachment[]
  /** 本轮附带的文件名（展示用） */
  attachedFileNames?: string[]
}

export interface ChatSession {
  id: string
  createdAt: string
  filePaths: string[]
  files: ParsedFile[]
  messages: ChatMessage[]
  usedSkills: string[]
}

export interface ContinueChatResult {
  reply: string
  usedMcpTools: string[]
  fileNames: string[]
}

export interface ParsedFile {
  path: string
  name: string
  extension: string
  kind: 'text' | 'image'
  text: string
  truncated: boolean
  mimeType?: string
  imageDataUrl?: string
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  triggers: string[]
  handler: string
  handlerModule?: string
}

export type PetState = 'idle' | 'dragging' | 'eating' | 'thinking' | 'talking'

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    baseUrl: 'http://172.16.0.201:7777/v1',
    apiKey: 'not-needed',
    model: 'Qwen3.6-35B-A3B-UD-Q4_K_M',
    maxTokens: 4096,
    temperature: 0.7,
    enableMcpTools: true
  },
  pet: {
    name: '小智',
    size: 180,
    startX: 100,
    startY: 100,
    skin: 'cat'
  },
  files: {
    allowedExtensions: [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.md', '.csv', '.ppt', '.pptx',
      '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'
    ],
    maxFileSizeMb: 20,
    maxFilesPerDrop: 10
  },
  memory: {
    maxHistoryItems: 200,
    contextWindowMessages: 10
  },
  mcp: {
    servers: []
  },
  skills: {
    enabled: [],
    directory: 'skills'
  },
  configServer: {
    port: 4789
  }
}
