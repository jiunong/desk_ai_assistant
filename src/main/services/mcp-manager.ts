import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { AppConfig, McpServerConfig } from '../../shared/types'

interface ConnectedMcp {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
}

export interface McpToolDef {
  serverId: string
  serverName: string
  name: string
  fullName: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export class McpManager {
  private connections = new Map<string, ConnectedMcp>()

  async sync(config: AppConfig): Promise<void> {
    const enabled = config.mcp.servers.filter((s) => s.enabled)
    const enabledIds = new Set(enabled.map((s) => s.id))

    for (const [id, conn] of this.connections) {
      if (!enabledIds.has(id)) {
        await conn.transport.close()
        this.connections.delete(id)
      }
    }

    for (const server of enabled) {
      if (this.connections.has(server.id)) continue
      try {
        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: { ...process.env, ...server.env } as Record<string, string>
        })
        const client = new Client({ name: 'desk-ai-assistant', version: '0.1.0' }, { capabilities: {} })
        await client.connect(transport)
        this.connections.set(server.id, { config: server, client, transport })
      } catch (err) {
        console.error(`MCP 连接失败 [${server.name}]:`, err)
      }
    }
  }

  private toolFullName(serverId: string, toolName: string): string {
    return `mcp_${serverId.replace(/[^a-zA-Z0-9_]/g, '_')}__${toolName.replace(/[^a-zA-Z0-9_]/g, '_')}`
  }

  async listTools(): Promise<Array<{ serverId: string; serverName: string; name: string; description?: string }>> {
    const tools = await this.getOpenAITools()
    return tools.map((t) => ({
      serverId: t.serverId,
      serverName: t.serverName,
      name: t.name,
      description: t.description
    }))
  }

  async getOpenAITools(): Promise<McpToolDef[]> {
    const tools: McpToolDef[] = []
    for (const [id, conn] of this.connections) {
      try {
        const result = await conn.client.listTools()
        for (const tool of result.tools) {
          tools.push({
            serverId: id,
            serverName: conn.config.name,
            name: tool.name,
            fullName: this.toolFullName(id, tool.name),
            description: tool.description,
            inputSchema: tool.inputSchema as Record<string, unknown> | undefined
          })
        }
      } catch (err) {
        console.error(`列出 MCP 工具失败 [${conn.config.name}]:`, err)
      }
    }
    return tools
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const conn = this.connections.get(serverId)
    if (!conn) throw new Error(`MCP 服务器未连接: ${serverId}`)

    const result = await conn.client.callTool({ name: toolName, arguments: args })
    const content = result.content
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'object' && c && 'text' in c ? String(c.text) : JSON.stringify(c)))
        .join('\n')
    }
    return JSON.stringify(content)
  }

  async shutdown(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.transport.close()
    }
    this.connections.clear()
  }
}

export const mcpManager = new McpManager()
