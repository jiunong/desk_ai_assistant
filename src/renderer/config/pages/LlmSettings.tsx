import { useEffect, useState } from 'react'
import type { AppConfig } from '../../shared/types'

export default function LlmSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [testResult, setTestResult] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
  }, [])

  if (!config) return <div className="loading">加载中...</div>

  const updateLlm = (patch: Partial<AppConfig['llm']>) => {
    setConfig({ ...config, llm: { ...config.llm, ...patch } })
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    const data = await res.json()
    if (data.config) setConfig(data.config)
    setSaving(false)
  }

  const runTest = async (autoSaveUrl: boolean) => {
    setTestResult('测试中...')
    const endpoint = autoSaveUrl ? '/api/llm/probe' : '/api/llm/test'
    const res = await fetch(endpoint, { method: 'POST' })
    const data = await res.json()
    if (data.baseUrl && data.baseUrl !== config.llm.baseUrl) {
      setConfig({ ...config, llm: { ...config.llm, baseUrl: data.baseUrl } })
    }
    setTestResult(
      data.ok
        ? `✓ ${data.message}${data.baseUrl ? `\n当前 API：${data.baseUrl}` : ''}`
        : `✗ ${data.message}`
    )
  }

  return (
    <div className="page">
      <h2>大模型配置</h2>
      <p className="desc">
        连接 llama.cpp / Ollama 等 OpenAI 兼容接口。若 nginx 反代，请填写完整路径（如 /v1）。
      </p>

      <label>
        API 地址（不含 /chat/completions）
        <input
          value={config.llm.baseUrl}
          onChange={(e) => updateLlm({ baseUrl: e.target.value })}
          placeholder="http://172.16.0.201:7777/v1"
        />
      </label>

      <p className="hint">
        常见地址：<code>http://172.16.0.201:7777/v1</code> · <code>http://172.16.0.201/v1</code> ·{' '}
        <code>http://172.16.0.201/api/v1</code>
      </p>

      <label>
        模型名称
        <input
          value={config.llm.model}
          onChange={(e) => updateLlm({ model: e.target.value })}
        />
      </label>

      <div className="row">
        <label>
          最大 Token
          <input
            type="number"
            value={config.llm.maxTokens}
            onChange={(e) => updateLlm({ maxTokens: Number(e.target.value) })}
          />
        </label>
        <label>
          温度
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={config.llm.temperature}
            onChange={(e) => updateLlm({ temperature: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.llm.enableMcpTools ?? true}
          onChange={(e) => updateLlm({ enableMcpTools: e.target.checked })}
        />
        分析时自动调用 MCP 工具（需先在 MCP 页配置并启用服务器）
      </label>

      <div className="actions">
        <button onClick={() => runTest(false)}>测试连接</button>
        <button onClick={() => runTest(true)}>自动探测 API 路径</button>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
      {testResult && <div className="test-result">{testResult}</div>}
    </div>
  )
}
