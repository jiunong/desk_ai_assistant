import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/types'
import { collectFilePaths, FILE_ACCEPT, fileNameFromPath } from './dialog-files'
import MarkdownContent from './MarkdownContent'
import WindowResizeHandles from './WindowResizeHandles'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const title = params.get('title') ?? '分析结果'

  const [sessionId, setSessionId] = useState('')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
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

  const appendPendingPaths = useCallback((paths: string[]) => {
    if (!paths.length) return
    setPendingFiles((prev) => {
      const merged = [...prev]
      for (const path of paths) {
        if (!merged.includes(path)) merged.push(path)
      }
      return merged
    })
    setError('')
  }, [])

  const addFiles = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length || loading) return

      try {
        const paths = await collectFilePaths(fileList)
        if (!paths.length) {
          setError('无法读取文件，请从资源管理器拖入或重新复制')
          return
        }
        appendPendingPaths(paths)
      } catch (err) {
        setError(err instanceof Error ? err.message : '文件读取失败')
      }
    },
    [appendPendingPaths, loading]
  )

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = [...(e.target.files ?? [])]
    e.target.value = ''
    await addFiles(fileList)
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = [...e.clipboardData.items]
    const files = items
      .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
      .filter((f): f is File => Boolean(f))

    if (!files.length) return

    e.preventDefault()
    void addFiles(files)
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!canChat || loading) return
    e.preventDefault()
    setDragOver(true)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!canChat || loading) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOver(false)
  }

  const onDrop = async (e: React.DragEvent) => {
    if (!canChat || loading) return
    e.preventDefault()
    setDragOver(false)
    const fileList = [...e.dataTransfer.files]
    await addFiles(fileList)
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const send = useCallback(async () => {
    const text = input.trim()
    const files = pendingFiles
    if ((!text && !files.length) || !sessionId || loading) return

    setInput('')
    setPendingFiles([])
    setError('')
    setLoading(true)

    const displayContent =
      text || (files.length ? `请分析附带文件：${files.map(fileNameFromPath).join('、')}` : '')

    const userMsg: ChatMessage = {
      role: 'user',
      content: displayContent,
      createdAt: new Date().toISOString(),
      ...(files.length ? { attachedFileNames: files.map(fileNameFromPath) } : {})
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const result = await window.dialogApi.chat(sessionId, displayContent, files)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.reply, createdAt: new Date().toISOString() }
      ])
      if (result.fileNames.length) {
        setFileNames(result.fileNames)
      }
      if (result.usedMcpTools.length) {
        setMeta((m) => ({ ...m, usedMcpTools: result.usedMcpTools }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
    } finally {
      setLoading(false)
    }
  }, [input, pendingFiles, sessionId, loading])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const canSend = Boolean(input.trim() || pendingFiles.length)

  return (
    <div
      className={`dialog-shell ${dragOver ? 'dialog-drag-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <WindowResizeHandles />
      <div className="dialog-header">
        <div>
          <h2>{title}</h2>
          {fileNames.length > 0 && (
            <p className="file-tags">📎 {fileNames.join(' · ')}</p>
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
              {msg.attachedFileNames?.length ? (
                <div className="msg-files">
                  {msg.attachedFileNames.map((name, j) => (
                    <span key={j} className="msg-file-chip">
                      📎 {name}
                    </span>
                  ))}
                </div>
              ) : null}
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
        <div className={`chat-input-area ${dragOver ? 'drag-over' : ''}`}>
          {dragOver && <div className="drop-hint">松开即可添加文件或图片</div>}
          {error && <div className="chat-error">{error}</div>}
          {pendingFiles.length > 0 && (
            <div className="pending-files">
              {pendingFiles.map((path, i) => (
                <div key={`${path}-${i}`} className="pending-file-chip">
                  <span>📎 {fileNameFromPath(path)}</span>
                  <button
                    type="button"
                    className="remove-file-btn"
                    onClick={() => removePendingFile(i)}
                    title="移除文件"
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
            placeholder="继续提问，可拖入/粘贴/添加文件与图片…（Enter 发送，Shift+Enter 换行）"
            rows={2}
            disabled={loading}
          />
          <div className="chat-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              multiple
              hidden
              onChange={onPickFiles}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              添加文件
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
