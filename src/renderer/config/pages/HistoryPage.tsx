import { useEffect, useState } from 'react'
import type { HistoryItem } from '../../../shared/types'

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])

  const load = () => {
    fetch('/api/history')
      .then((r) => r.json())
      .then(setItems)
  }

  useEffect(load, [])

  const clearAll = async () => {
    if (!confirm('确定清空全部历史记忆？')) return
    await fetch('/api/history', { method: 'DELETE' })
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>历史记忆</h2>
        <button className="danger" onClick={clearAll}>
          清空全部
        </button>
      </div>

      <div className="history-list">
        {items.length === 0 && <p className="empty">暂无历史记录</p>}
        {items.map((item) => (
          <div key={item.id} className="history-card">
            <div className="history-meta">
              <span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
              <span>{item.files.map((f) => f.split(/[/\\]/).pop()).join(', ')}</span>
            </div>
            <p className="history-prompt">{item.userPrompt}</p>
            <p className="history-reply">{item.assistantReply.slice(0, 300)}...</p>
          </div>
        ))}
      </div>
    </div>
  )
}
