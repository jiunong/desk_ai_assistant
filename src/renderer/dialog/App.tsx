import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ImageAttachment } from '../../shared/types'
import MarkdownContent from './MarkdownContent'
import WindowResizeHandles from './WindowResizeHandles'

function readFileAsAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('无法读取图片'))
        return
      }
      resolve({
        name: file.name || '粘贴的图片',
        mimeType: file.type || 'image/png',
        dataUrl
      })
    }
    reader.onerror = () => reject(new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const title = params.get('title') ?? '分析结果'

  const [sessionId, setSessionId] = useState('')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<{ usedSkills?: string[]; usedMcpTools?: string[] }>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canChat = Boolean(sessionId)

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }

  useEffect(() => {
    window.dialogApi.onInit((payload) => {
      setSessionId(payload.sessionId)
      setFileNames(payload.fileNames)
      setMessages(payload.messages)
      setMeta(payload.meta ?? {})
    })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const addImages = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    try {
      const attachments = await Promise.all(imageFiles.map(readFileAsAttachment))
      setPendingImages((prev) => [...prev, ...attachments])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片读取失败')
    }
  }, [])

  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    await addImages(files)
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = [...e.clipboardData.items]
    const imageItems = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f))

    if (!imageItems.length) return
    e.preventDefault()
    void addImages(imageItems)
  }

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const send = useCallback(async () => {
    const text = input.trim()
    const attachments = pendingImages
    if ((!text && !attachments.length) || !sessionId || loading) return

    setInput('')
    setPendingImages([])
    setError('')
    setLoading(true)

    const displayContent = text || (attachments.length ? '请分析附带的图片' : '')
    const userMsg: ChatMessage = {
      role: 'user',
      content: displayContent,
      createdAt: new Date().toISOString(),
      ...(attachments.length ? { attachments } : {})
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const result = await window.dialogApi.chat(sessionId, displayContent, attachments)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply, createdAt: new Date().toISOString() }
      ])
      if (result.usedMcpTools.length) {
        setMeta((m) => ({ ...m, usedMcpTools: result.usedMcpTools }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setLoading(false)
    }
  }, [input, pendingImages, sessionId, loading])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const canSend = Boolean(input.trim() || pendingImages.length)

  return (
    <div className="dialog-shell">
      <WindowResizeHandles />
      <div className="dialog-header">
        <div>
          <h2>{title}</h2>
          {fileNames.length > 0 && (
            <p className="file-tags">
              📎 {fileNames.join(' · ')}
            </p>
          )}
        </div>
        <button className="close-btn" onClick={() => window.dialogApi.close()}>
          ✕
        </button>
      </div>

      <div className="dialog-body" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`msg-bubble ${msg.role}`}>
            <div className="msg-label">{msg.role === 'user' ? '你' : '小智'}</div>
            <div className="msg-content">
              {msg.attachments?.length ? (
                <div className="msg-images">
                  {msg.attachments.map((img, j) => (
                    <img key={j} src={img.dataUrl} alt={img.name} className="msg-image" />
                  ))}
                </div>
              ) : null}
              <MarkdownContent content={msg.content} />
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg-bubble assistant loading-bubble">
            <div className="msg-label">小智</div>
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {(meta.usedSkills?.length || meta.usedMcpTools?.length) ? (
          <div className="meta-bar">
            {meta.usedSkills?.length ? `Skill: ${meta.usedSkills.join(', ')}` : ''}
            {meta.usedMcpTools?.length ? ` · MCP: ${meta.usedMcpTools.join(', ')}` : ''}
          </div>
        ) : null}
      </div>

      {canChat ? (
        <div className="chat-input-area">
          {error && <div className="chat-error">{error}</div>}
          {pendingImages.length > 0 && (
            <div className="pending-images">
              {pendingImages.map((img, i) => (
                <div key={i} className="pending-image-wrap">
                  <img src={img.dataUrl} alt={img.name} className="pending-image" />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => removePendingImage(i)}
                    title="移除图片"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="继续提问，可粘贴或添加图片…（Enter 发送，Shift+Enter 换行）"
            rows={2}
            disabled={loading}
          />
          <div className="chat-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onPickImages}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              添加图片
            </button>
            <button className="send-btn" onClick={() => void send()} disabled={loading || !canSend}>
              {loading ? '思考中…' : '发送'}
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-footer">
          <button onClick={() => window.dialogApi.close()}>关闭</button>
        </div>
      )}
    </div>
  )
}
