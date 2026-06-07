import OpenAI from 'openai'
import { normalizeLlmContent } from '../../shared/content-normalize'
import { AppConfig } from '../../shared/types'
import { getRecentContext } from './memory'
import { mcpManager, McpToolDef } from './mcp-manager'
import { buildCurrentTimeSection } from './prompt-template'
import { formatLlmError, normalizeBaseUrl, probeLlmBaseUrl } from './llm-url'

export { probeLlmBaseUrl, formatLlmError, normalizeBaseUrl }

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type LlmConversationMessage = {
  role: 'user' | 'assistant'
  content: string | LlmContentPart[]
}

function normalizeReply(content: string | null | undefined): string {
  return normalizeLlmContent(content ?? '（模型未返回内容）')
}

function toChatMessageParam(msg: LlmConversationMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: msg.content }
  }
  return { role: msg.role, content: msg.content }
}

export class LlmService {
  private client: OpenAI

  constructor(private config: AppConfig) {
    this.client = this.createClient(config)
  }

  private createClient(config: AppConfig): OpenAI {
    return new OpenAI({
      baseURL: normalizeBaseUrl(config.llm.baseUrl),
      apiKey: config.llm.apiKey || 'not-needed',
      dangerouslyAllowBrowser: false,
      timeout: 120_000
    })
  }

  updateConfig(config: AppConfig): void {
    this.config = config
    this.client = this.createClient(config)
  }

  private buildSystemPrompt(extra?: string): string {
    const base = `你是桌面宠物助手「${this.config.pet.name}」，擅长分析 Word、PDF、Excel、PPT 等文档，也能理解图片内容。回答用中文，结构清晰，重点突出。`
    const parts = [base, buildCurrentTimeSection()]
    if (extra) parts.push(extra)
    return parts.join('\n\n')
  }

  /** 基于会话消息对话（不使用全局历史，文档上下文在 systemPrompt 中） */
  async chatConversation(
    systemPrompt: string,
    conversation: LlmConversationMessage[],
    onChunk?: (delta: string) => void
  ): Promise<{ reply: string; usedTools: string[] }> {
    const usedTools: string[] = []
    let mcpTools: McpToolDef[] = []

    if (this.config.llm.enableMcpTools) {
      try {
        mcpTools = await mcpManager.getOpenAITools()
      } catch (err) {
        console.error('获取 MCP 工具失败:', err)
      }
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(
          systemPrompt +
            (mcpTools.length ? '\n\n若需要查外部信息可调用工具；否则基于文档回答。' : '')
        )
      }
    ]

    for (const msg of conversation) {
      messages.push(toChatMessageParam(msg))
    }

    const openAiTools: OpenAI.Chat.ChatCompletionTool[] = mcpTools.map((t) => ({
      type: 'function',
      function: {
        name: t.fullName,
        description: t.description ?? t.name,
        parameters: t.inputSchema ?? { type: 'object', properties: {} }
      }
    }))

    const requestOptions = {
      model: this.config.llm.model,
      messages,
      max_tokens: this.config.llm.maxTokens,
      temperature: this.config.llm.temperature,
      ...(openAiTools.length ? { tools: openAiTools, tool_choice: 'auto' as const } : {})
    }

    try {
      for (let round = 0; round < 6; round++) {
        if (onChunk) {
          const stream = await this.client.chat.completions.create({
            ...requestOptions,
            stream: true
          })

          let content = ''
          const toolCallAccums = new Map<
            number,
            { id: string; name: string; arguments: string }
          >()

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta
            if (!delta) continue

            if (delta.content) {
              content += delta.content
              onChunk(delta.content)
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                let acc = toolCallAccums.get(idx)
                if (!acc) {
                  acc = { id: '', name: '', arguments: '' }
                  toolCallAccums.set(idx, acc)
                }
                if (tc.id) acc.id = tc.id
                if (tc.function?.name) acc.name += tc.function.name
                if (tc.function?.arguments) acc.arguments += tc.function.arguments
              }
            }
          }

          const toolCalls = [...toolCallAccums.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, t]) => t)
            .filter((t) => t.id && t.name)

          if (!toolCalls.length) {
            return { reply: normalizeReply(content), usedTools }
          }

          messages.push({
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.map((t) => ({
              id: t.id,
              type: 'function' as const,
              function: { name: t.name, arguments: t.arguments }
            }))
          })

          for (const call of toolCalls) {
            const toolMeta = mcpTools.find((t) => t.fullName === call.name)
            if (!toolMeta) {
              messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: `未知工具: ${call.name}`
              })
              continue
            }

            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
            } catch {
              args = {}
            }

            try {
              const result = await mcpManager.callTool(toolMeta.serverId, toolMeta.name, args)
              usedTools.push(`${toolMeta.serverName}/${toolMeta.name}`)
              messages.push({ role: 'tool', tool_call_id: call.id, content: result })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              messages.push({ role: 'tool', tool_call_id: call.id, content: `工具调用失败: ${msg}` })
            }
          }

          continue
        }

        const response = await this.client.chat.completions.create(requestOptions)

        const choice = response.choices[0]?.message
        if (!choice) return { reply: '（模型未返回内容）', usedTools }

        const toolCalls = choice.tool_calls
        if (!toolCalls?.length) {
          return { reply: normalizeReply(choice.content), usedTools }
        }

        messages.push(choice)

        for (const call of toolCalls) {
          if (call.type !== 'function') continue
          const toolMeta = mcpTools.find((t) => t.fullName === call.function.name)
          if (!toolMeta) {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: `未知工具: ${call.function.name}`
            })
            continue
          }

          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
          } catch {
            args = {}
          }

          try {
            const result = await mcpManager.callTool(toolMeta.serverId, toolMeta.name, args)
            usedTools.push(`${toolMeta.serverName}/${toolMeta.name}`)
            messages.push({ role: 'tool', tool_call_id: call.id, content: result })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            messages.push({ role: 'tool', tool_call_id: call.id, content: `工具调用失败: ${msg}` })
          }
        }
      }

      return { reply: '（工具调用轮次过多，请简化问题后重试）', usedTools }
    } catch (err) {
      throw new Error(formatLlmError(err))
    }
  }

  private buildMessages(userContent: string, systemPrompt?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
    const history = getRecentContext(this.config.memory.contextWindowMessages)
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(systemPrompt) }
    ]
    for (const item of history) {
      messages.push({ role: 'user', content: item.userPrompt })
      messages.push({ role: 'assistant', content: item.assistantReply })
    }
    messages.push({ role: 'user', content: userContent })
    return messages
  }

  async chat(userContent: string, systemPrompt?: string): Promise<string> {
    try {
      const messages = this.buildMessages(userContent, systemPrompt)
      const response = await this.client.chat.completions.create({
        model: this.config.llm.model,
        messages,
        max_tokens: this.config.llm.maxTokens,
        temperature: this.config.llm.temperature
      })
      return normalizeReply(response.choices[0]?.message?.content)
    } catch (err) {
      throw new Error(formatLlmError(err))
    }
  }

  async chatWithMcpTools(
    userContent: string,
    systemPrompt?: string
  ): Promise<{ reply: string; usedTools: string[] }> {
    const usedTools: string[] = []
    let mcpTools: McpToolDef[] = []

    if (this.config.llm.enableMcpTools) {
      try {
        mcpTools = await mcpManager.getOpenAITools()
      } catch (err) {
        console.error('获取 MCP 工具失败:', err)
      }
    }

    const messages = this.buildMessages(
      userContent,
      systemPrompt ??
        (mcpTools.length
          ? '若需要查外部信息或执行工具操作，可调用可用工具；否则直接基于文档内容回答。'
          : undefined)
    )

    const openAiTools: OpenAI.Chat.ChatCompletionTool[] = mcpTools.map((t) => ({
      type: 'function',
      function: {
        name: t.fullName,
        description: t.description ?? t.name,
        parameters: t.inputSchema ?? { type: 'object', properties: {} }
      }
    }))

    try {
      for (let round = 0; round < 6; round++) {
        const response = await this.client.chat.completions.create({
          model: this.config.llm.model,
          messages,
          max_tokens: this.config.llm.maxTokens,
          temperature: this.config.llm.temperature,
          ...(openAiTools.length ? { tools: openAiTools, tool_choice: 'auto' } : {})
        })

        const choice = response.choices[0]?.message
        if (!choice) return { reply: '（模型未返回内容）', usedTools }

        const toolCalls = choice.tool_calls
        if (!toolCalls?.length) {
          return { reply: normalizeReply(choice.content), usedTools }
        }

        messages.push(choice)

        for (const call of toolCalls) {
          if (call.type !== 'function') continue
          const toolMeta = mcpTools.find((t) => t.fullName === call.function.name)
          if (!toolMeta) {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: `未知工具: ${call.function.name}`
            })
            continue
          }

          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
          } catch {
            args = {}
          }

          try {
            const result = await mcpManager.callTool(toolMeta.serverId, toolMeta.name, args)
            usedTools.push(`${toolMeta.serverName}/${toolMeta.name}`)
            messages.push({ role: 'tool', tool_call_id: call.id, content: result })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            messages.push({ role: 'tool', tool_call_id: call.id, content: `工具调用失败: ${msg}` })
          }
        }
      }

      return { reply: '（工具调用轮次过多，请简化问题后重试）', usedTools }
    } catch (err) {
      throw new Error(formatLlmError(err))
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string; baseUrl?: string }> {
    const result = await probeLlmBaseUrl(
      this.config.llm.baseUrl,
      this.config.llm.model,
      this.config.llm.apiKey
    )
    if (result.ok) {
      return { ok: true, message: result.message, baseUrl: result.baseUrl }
    }
    return { ok: false, message: result.message }
  }
}
