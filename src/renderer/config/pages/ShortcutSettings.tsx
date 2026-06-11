import { useEffect, useState } from 'react'
import type { AppConfig } from '../../../shared/types'

type ShortcutKey = keyof AppConfig['shortcuts']

const SHORTCUT_FIELDS: Array<{
  key: ShortcutKey
  label: string
  description: string
}> = [
  {
    key: 'openConfig',
    label: '打开配置页',
    description: '从任意位置快速打开设置窗口'
  },
  {
    key: 'openChat',
    label: '开始对话',
    description: '打开新的对话窗口'
  },
  {
    key: 'screenshot',
    label: '区域截图',
    description: '框选屏幕区域，截图添加到当前对话（无对话时自动新建）'
  },
  {
    key: 'togglePet',
    label: '显示/隐藏宠物',
    description: '切换桌面宠物窗口的可见性'
  }
]

function formatAccelerator(acc: string): string {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  return acc
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/\+/g, ' + ')
}

function normalizeElectronKey(key: string): string | null {
  if (key.length === 1) return key.toUpperCase()
  const map: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert'
  }
  return map[key] ?? (key.startsWith('F') && /^F\d+$/.test(key) ? key : key)
}

function ShortcutField({
  label,
  description,
  value,
  onChange
}: {
  label: string
  description: string
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

    const mods: string[] = []
    if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
    if (e.altKey) mods.push('Alt')
    if (e.shiftKey) mods.push('Shift')

    const key = normalizeElectronKey(e.key)
    if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

    onChange([...mods, key].join('+'))
    setRecording(false)
  }

  return (
    <label className="shortcut-field">
      <span className="shortcut-label">{label}</span>
      <div className="shortcut-input-row">
        <button
          type="button"
          className={`shortcut-input ${recording ? 'recording' : ''}`}
          onClick={() => setRecording(true)}
          onKeyDown={recording ? onKeyDown : undefined}
          onBlur={() => setRecording(false)}
        >
          {recording ? '请按下快捷键…' : value ? formatAccelerator(value) : '（未设置，点击录制）'}
        </button>
        {value ? (
          <button type="button" className="link-btn" onClick={() => onChange('')}>
            清除
          </button>
        ) : null}
      </div>
      <span className="hint">{description}</span>
    </label>
  )
}

export default function ShortcutSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setConfig)
  }, [])

  if (!config) return <div className="loading">加载中...</div>

  const save = async () => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortcuts: config.shortcuts })
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateShortcut = (key: ShortcutKey, value: string) => {
    setConfig({
      ...config,
      shortcuts: { ...config.shortcuts, [key]: value }
    })
  }

  return (
    <div className="page">
      <h2>快捷键</h2>
      <p className="desc">全局快捷键在应用运行期间生效。留空表示禁用该项。修改后请点击保存。</p>

      {SHORTCUT_FIELDS.map((field) => (
        <ShortcutField
          key={field.key}
          label={field.label}
          description={field.description}
          value={config.shortcuts[field.key]}
          onChange={(value) => updateShortcut(field.key, value)}
        />
      ))}

      <p className="hint">
        提示：截图快捷键会进入全屏选区模式，选区确认后可移动/缩放预览，点击「发送到对话」或按 Enter 确认；Esc 取消。也可在对话内点击「截图」按钮。
      </p>

      <div className="actions">
        <button className="primary" onClick={save}>
          保存配置
        </button>
        {saved ? <span className="save-ok">已保存</span> : null}
      </div>
    </div>
  )
}
