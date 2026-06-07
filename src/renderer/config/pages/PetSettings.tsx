import { useEffect, useState } from 'react'
import type { AppConfig } from '../../../shared/types'

export default function PetSettings() {
  const [config, setConfig] = useState<AppConfig | null>(null)

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
      body: JSON.stringify(config)
    })
  }

  return (
    <div className="page">
      <h2>宠物设置</h2>

      <label>
        宠物名称
        <input
          value={config.pet.name}
          onChange={(e) => setConfig({ ...config, pet: { ...config.pet, name: e.target.value } })}
        />
      </label>

      <label>
        宠物大小 ({config.pet.size}px)
        <input
          type="range"
          min={80}
          max={360}
          step={10}
          value={config.pet.size}
          onChange={(e) => setConfig({ ...config, pet: { ...config.pet, size: Number(e.target.value) } })}
        />
      </label>

      <p className="hint">形象使用内置 logo，可在设置中调节显示大小；托盘菜单可隐藏/显示宠物。</p>

      <label>
        允许的文件格式（逗号分隔）
        <input
          value={config.files.allowedExtensions.join(', ')}
          onChange={(e) =>
            setConfig({
              ...config,
              files: {
                ...config.files,
                allowedExtensions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              }
            })
          }
        />
      </label>

      <div className="row">
        <label>
          单文件上限 (MB)
          <input
            type="number"
            value={config.files.maxFileSizeMb}
            onChange={(e) =>
              setConfig({
                ...config,
                files: { ...config.files, maxFileSizeMb: Number(e.target.value) }
              })
            }
          />
        </label>
        <label>
          单次最多文件数
          <input
            type="number"
            value={config.files.maxFilesPerDrop}
            onChange={(e) =>
              setConfig({
                ...config,
                files: { ...config.files, maxFilesPerDrop: Number(e.target.value) }
              })
            }
          />
        </label>
      </div>

      <label>
        记忆上下文条数
        <input
          type="number"
          value={config.memory.contextWindowMessages}
          onChange={(e) =>
            setConfig({
              ...config,
              memory: { ...config.memory, contextWindowMessages: Number(e.target.value) }
            })
          }
        />
      </label>

      <div className="actions">
        <button className="primary" onClick={save}>
          保存配置
        </button>
      </div>
    </div>
  )
}
