import { v4 as uuidv4 } from 'uuid'
import {
  AnalysisRequest,
  AnalysisResult,
  AppConfig,
  ChatMessage,
  ContinueChatResult,
  ParsedFile
} from '../../shared/types'
import { basename, extname } from 'path'
import {
  buildDocumentPrompt,
  buildVisionUserContent,
  IMAGE_EXTENSIONS,
  parseFiles,
  toImageAttachments,
  validateFiles
} from './file-parser'
import type { LlmConversationMessage } from './llm'
import { LlmService } from './llm'
import { addHistory, trimHistory } from './memory'
import { mcpManager } from './mcp-manager'
import { buildSessionSystemPrompt } from './prompt-template'
import {
  addSessionFiles,
  appendMessage,
  createSession,
  getSession,
  getSessionSnapshot,
  resolveAttachmentPath as findAttachmentPath
} from './session-store'
import { skillManager } from './skill-manager'

export type AnalyzePreparedInfo = {
  sessionId: string
  title: string
  messages: ChatMessage[]
  fileNames: string[]
  meta: { usedSkills: string[] }
}

export type AnalyzeCallbacks = {
  onPrepared?: (info: AnalyzePreparedInfo) => void | Promise<void>
  onChunk?: (delta: string) => void
}

export class AnalysisService {
  private llm: LlmService

  constructor(private config: AppConfig) {
    this.llm = new LlmService(config)
    skillManager.load(config)
    skillManager.startWatch(config, () => skillManager.load(this.config))
  }

  updateConfig(config: AppConfig): void {
    this.config = config
    this.llm.updateConfig(config)
    skillManager.load(config)
  }

  getSession(sessionId: string) {
    return getSessionSnapshot(sessionId)
  }

  resolveAttachmentPath(sessionId: string, fileName: string): string | null {
    return findAttachmentPath(sessionId, fileName)
  }

  openDirectChat(): { sessionId: string; welcome: string } {
    const session = createSession([], [], [])
    const welcome = `你好，我是${this.config.pet.name}！有什么可以帮你的？也可以把文档或图片拖到我身上来分析。`
    appendMessage(session.id, {
      role: 'assistant',
      content: welcome,
      createdAt: new Date().toISOString()
    })
    return { sessionId: session.id, welcome }
  }

  async analyze(req: AnalysisRequest, callbacks?: AnalyzeCallbacks): Promise<AnalysisResult> {
    const { valid, errors } = validateFiles(req.filePaths, this.config)
    if (valid.length === 0) {
      throw new Error(errors.join('\n') || '没有有效文件')
    }

    const userPrompt = req.userPrompt ?? ''
    const fileNames = valid.map((p) => basename(p))
    const hasImages = valid.some((p) => IMAGE_EXTENSIONS.includes(extname(p).toLowerCase()))
    const displayUserMsg =
      userPrompt ||
      (hasImages
        ? `请分析以下内容：${fileNames.join('、')}`
        : `请分析以下文档：${fileNames.join('、')}`)

    const session = createSession(valid, [], [])
    const now = new Date().toISOString()
    const fileTitle = valid.length === 1 ? fileNames[0] : `分析结果 (${valid.length} 个文件)`

    if (callbacks?.onPrepared) {
      await callbacks.onPrepared({
        sessionId: session.id,
        title: fileTitle,
        messages: [
          {
            role: 'user',
            content: displayUserMsg,
            createdAt: now,
            attachedFileNames: fileNames,
            attachedFilePaths: valid
          },
          { role: 'assistant', content: '', createdAt: now }
        ],
        fileNames,
        meta: { usedSkills: [] }
      })
    }

    const files = await parseFiles(valid)
    session.files = files

    const extensions = files.map((f) => f.extension)
    const matchedSkills = skillManager.match(this.config, userPrompt, extensions)
    session.usedSkills = matchedSkills.map((s) => s.id)

    const skillOutputs: string[] = []
    for (const skill of matchedSkills) {
      const result = await skillManager.run(skill, {
        files: files.map((f) => ({ name: f.name, text: f.text })),
        userPrompt
      })
      skillOutputs.push(result.output)
    }

    let userContent = buildDocumentPrompt(files, userPrompt || undefined)
    if (skillOutputs.length) {
      userContent = `${skillOutputs.join('\n\n')}\n\n${userContent}`
    }

    const systemPrompt = buildSessionSystemPrompt(
      this.config.pet.name,
      files.map((f) => ({
        name: f.name,
        text: f.text,
        truncated: f.truncated,
        kind: f.kind
      }))
    )

    const userLlmContent = buildVisionUserContent(
      userContent,
      files.filter((f) => f.kind === 'image')
    )

    const imageAttachments = toImageAttachments(files)
    appendMessage(session.id, {
      role: 'user',
      content: displayUserMsg,
      createdAt: now,
      attachedFileNames: fileNames,
      attachedFilePaths: valid,
      ...(imageAttachments.length ? { attachments: imageAttachments } : {})
    })

    const { reply, usedTools } = await this.llm.chatConversation(
      systemPrompt,
      [{ role: 'user', content: userLlmContent }],
      callbacks?.onChunk
    )

    appendMessage(session.id, { role: 'assistant', content: reply, createdAt: now })

    addHistory({
      files: valid,
      userPrompt: userPrompt || '分析拖入的文档',
      assistantReply: reply,
      summary: reply.slice(0, 200)
    })
    trimHistory(this.config.memory.maxHistoryItems)

    return {
      id: session.id,
      sessionId: session.id,
      reply,
      files,
      usedSkills: matchedSkills.map((s) => s.id),
      usedMcpTools: usedTools
    }
  }

  private buildLlmConversation(messages: ChatMessage[]): LlmConversationMessage[] {
    return messages.map((m) => ({
      role: m.role,
      content: this.messageToLlmContent(m)
    }))
  }

  private messageToLlmContent(
    message: ChatMessage
  ): string | import('./llm').LlmContentPart[] {
    const images = message.attachments ?? []
    if (!images.length) return message.content
    return buildVisionUserContent(message.content, images.map((a) => ({ imageDataUrl: a.dataUrl })))
  }

  async continueChat(
    sessionId: string,
    userMessage: string,
    filePaths?: string[],
    onChunk?: (delta: string) => void
  ): Promise<ContinueChatResult> {
    const session = getSession(sessionId)
    if (!session) {
      throw new Error('会话已过期，请重新打开对话')
    }

    let newFiles: ParsedFile[] = []
    let newFilePaths: string[] = []
    if (filePaths?.length) {
      const { valid, errors } = validateFiles(filePaths, this.config)
      if (!valid.length) {
        throw new Error(errors.join('\n') || '没有有效文件')
      }
      newFilePaths = valid
      newFiles = await parseFiles(valid)
      addSessionFiles(sessionId, valid, newFiles)
    }

    const trimmed = userMessage.trim()
    if (!trimmed && !newFiles.length) {
      throw new Error('请输入问题或添加文件')
    }

    const displayContent =
      trimmed ||
      (newFiles.length ? `请分析附带文件：${newFiles.map((f) => f.name).join('、')}` : '')

    const now = new Date().toISOString()
    const imageAttachments = toImageAttachments(newFiles)
    appendMessage(sessionId, {
      role: 'user',
      content: displayContent,
      createdAt: now,
      ...(newFiles.length
        ? {
            attachedFileNames: newFiles.map((f) => f.name),
            attachedFilePaths: newFilePaths
          }
        : {}),
      ...(imageAttachments.length ? { attachments: imageAttachments } : {})
    })

    const updatedSession = getSession(sessionId)!
    const systemPrompt = buildSessionSystemPrompt(
      this.config.pet.name,
      updatedSession.files.map((f) => ({
        name: f.name,
        text: f.text,
        truncated: f.truncated,
        kind: f.kind
      }))
    )

    const conversation = this.buildLlmConversation(updatedSession.messages)

    const { reply, usedTools } = await this.llm.chatConversation(systemPrompt, conversation, onChunk)
    appendMessage(sessionId, { role: 'assistant', content: reply, createdAt: new Date().toISOString() })

    return {
      reply,
      usedMcpTools: usedTools,
      fileNames: updatedSession.files.map((f) => f.name)
    }
  }

  async refreshMcp(): Promise<void> {
    await mcpManager.sync(this.config)
  }
}
