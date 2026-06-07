import { useEffect, useState } from 'react'
import type { AppConfig, McpServerConfig } from '../../../shared/types'

export default function McpSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [tools, setTools] = useState<Array<{ serverName: string; name: string; description?: string }>>([])

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
    fetch('/api/mcp/tools')
      .then((r) => r.json())
      .then(setTools)
      .catch(() => setTools([]))
  }, [])

  if (!config) return <div className="loading">加载中...</div>

  const addServer = () => {
    const server: McpServerConfig = {
      id: `mcp-${Date.now()}`,
      name: '新 MCP 服务',
      enabled: false,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
    }
    setConfig({ ...config, mcp: { servers: [...config.mcp.servers, server] } })
  }

  const save = async () => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    const res = await fetch('/api/mcp/tools')
    setTools(await res.json())
  }

  return (
    <div className="page">
      <h2>MCP / Skill 扩展</h2>
      <p className="desc">
        MCP 服务器通过 stdio 连接；Skill 插件放在用户数据目录的 skills 文件夹（JSON 定义）。
      </p>

      <h3>MCP 服务器</h3>
      {config.mcp.servers.map((server, idx) => (
        <div key={server.id} className="mcp-card">
          <label>
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => {
                const servers = [...config.mcp.servers]
                servers[idx] = { ...server, enabled: e.target.checked }
                setConfig({ ...config, mcp: { servers } })
              }}
            />
            启用
          </label>
          <input
            value={server.name}
            onChange={(e) => {
              const servers = [...config.mcp.servers]
              servers[idx] = { ...server, name: e.target.value }
              setConfig({ ...config, mcp: { servers } })
            }}
            placeholder="名称"
          />
          <input
            value={server.command}
            onChange={(e) => {
              const servers = [...config.mcp.servers]
              servers[idx] = { ...server, command: e.target.value }
              setConfig({ ...config, mcp: { servers } })
            }}
            placeholder="命令"
          />
          <input
            value={server.args.join(' ')}
            onChange={(e) => {
              const servers = [...config.mcp.servers]
              servers[idx] = { ...server, args: e.target.value.split(' ').filter(Boolean) }
              setConfig({ ...config, mcp: { servers } })
            }}
            placeholder="参数（空格分隔）"
          />
        </div>
      ))}

      <button onClick={addServer}>+ 添加 MCP 服务器</button>

      <h3>已连接工具</h3>
      <ul className="tool-list">
        {tools.length === 0 && <li className="empty">暂无可用 MCP 工具</li>}
        {tools.map((t, i) => (
          <li key={i}>
            <strong>{t.serverName}</strong> / {t.name}
            {t.description && <span> — {t.description}</span>}
          </li>
        ))}
      </ul>

      <h3>Skill 插件</h3>
      <p className="desc">
        在配置中启用 skill ID：<code>{config.skills.enabled.join(', ') || '（未启用）'}</code>
      </p>
      <label>
        启用的 Skill ID（逗号分隔）
        <input
          value={config.skills.enabled.join(', ')}
          onChange={(e) =>
            setConfig({
              ...config,
              skills: {
                ...config.skills,
                enabled: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              }
            })
          }
        />
      </label>

      <div className="actions">
        <button className="primary" onClick={save}>
          保存并重连 MCP
        </button>
      </div>
    </div>
  )
}
