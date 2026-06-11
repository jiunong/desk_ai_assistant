import { useEffect, useState } from 'react'
import type { AppConfig, AsrMode } from '../../../shared/types'
import { formatHoldKeyLabel, normalizeCaptureKey } from '../../../shared/hold-key'

const MODES: { value: AsrMode; label: string }[] = [
  { value: '2pass', label: '2pass（推荐）' },
  { value: 'online', label: 'online（实时）' },
  { value: 'offline', label: 'offline（离线）' }
]

function HoldKeyField({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [recording, setRecording] = useState(false)

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      setRecording(false)
      return
    }

    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      onChange('')
      setRecording(false)
      return
    }

    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return

    const key = normalizeCaptureKey(e.key)
    if (!key) return

    onChange(key)
    setRecording(false)
  }

  return (
    <label className="shortcut-field">
      <span className="shortcut-label">按住说话的按键</span>
      <div className="shortcut-input-row">
        <button
          type="button"
          className={`shortcut-input ${recording ? 'recording' : ''}`}
          onClick={() => setRecording(true)}
          onKeyDown={recording ? onKeyDown : undefined}
          onBlur={() => setRecording(false)}
        >
          {recording ? '请按下按键（Esc 取消）' : value ? formatHoldKeyLabel(value) : '（未设置，点击录制）'}
        </button>
        {value ? (
          <button type="button" className="link-btn" onClick={() => onChange('')}>
            清除
          </button>
        ) : null}
      </div>
      <span className="hint">全局生效：长按该键达到触发时长后开始录音，识别内容实时显示在对话框输入框</span>
    </label>
  )
}

export default function AsrSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
  }, [])

  if (!config) return <div className="loading">加载中...</div>

  const updateAsr = (patch: Partial<AppConfig['asr']>) => {
    setConfig({ ...config, asr: { ...config.asr, ...patch } })
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

  const authUrl = config.asr.wssUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')

  return (
    <div className="page">
      <h2>语音识别</h2>
      <p className="desc">
        基于 FunASR WebSocket 服务。按住麦克风说话时，识别文字会<strong>实时显示在对话框输入框</strong>，松手后填入内容（不自动发送，可编辑后按 Enter 发送）。
      </p>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.asr.enabled}
          onChange={(e) => updateAsr({ enabled: e.target.checked })}
        />
        启用语音对话
      </label>

      <label>
        ASR 服务器地址（WebSocket）
        <input
          value={config.asr.wssUrl}
          onChange={(e) => updateAsr({ wssUrl: e.target.value })}
          placeholder="wss://127.0.0.1:10095/"
        />
      </label>

      <p className="hint">
        自签名证书需在浏览器中先访问{' '}
        <a href={authUrl} target="_blank" rel="noreferrer">
          {authUrl}
        </a>{' '}
        完成授权，再使用语音识别。
      </p>

      <fieldset className="radio-group">
        <legend>识别模式</legend>
        {MODES.map((m) => (
          <label key={m.value} className="radio-inline">
            <input
              type="radio"
              name="asr_mode"
              value={m.value}
              checked={config.asr.mode === m.value}
              onChange={() => updateAsr({ mode: m.value })}
            />
            {m.label}
          </label>
        ))}
      </fieldset>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.asr.useItn}
          onChange={(e) => updateAsr({ useItn: e.target.checked })}
        />
        逆文本标准化（ITN，如将「一百二十三」转为「123」）
      </label>

      <label>
        热词（一行一个，格式：关键词 权重，如「阿里巴巴 20」）
        <textarea
          rows={4}
          value={config.asr.hotwords}
          onChange={(e) => updateAsr({ hotwords: e.target.value })}
          placeholder={'阿里巴巴 20\nhello world 40'}
        />
      </label>

      <h3 className="section-title">按住说话</h3>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={config.asr.enableHoldShortcut}
          onChange={(e) => updateAsr({ enableHoldShortcut: e.target.checked })}
        />
        启用按键长按说话（全局）
      </label>

      <HoldKeyField value={config.asr.holdKey} onChange={(holdKey) => updateAsr({ holdKey })} />

      <label>
        触发录音前需按住时长（毫秒）
        <input
          type="number"
          min={0}
          max={10000}
          step={100}
          value={config.asr.holdDelayMs}
          onChange={(e) => updateAsr({ holdDelayMs: Math.max(0, Number(e.target.value) || 0) })}
        />
      </label>
      <p className="hint">
        例如设为 2000 表示长按 {formatHoldKeyLabel(config.asr.holdKey || 'Space')} 满 2 秒后才开始录音，松手将文字填入输入框。在输入框内打字时不会触发。
      </p>

      <div className="actions">
        <button className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
