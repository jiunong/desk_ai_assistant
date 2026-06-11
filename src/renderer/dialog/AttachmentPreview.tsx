import { useEffect, useState } from 'react'
import { fileNameFromPath } from './dialog-files'

type PreviewData = Awaited<ReturnType<typeof window.dialogApi.previewFile>>

export type AttachmentPreviewTarget =
  | { type: 'path'; path: string }
  | { type: 'image'; url: string; name: string }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  target: AttachmentPreviewTarget | null
  onClose: () => void
}

export default function AttachmentPreview({ target, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)

  useEffect(() => {
    if (!target || target.type === 'image') {
      setPreview(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setPreview(null)

    void window.dialogApi.previewFile(target.path).then((result) => {
      if (!cancelled) setPreview(result)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [target])

  useEffect(() => {
    if (!target) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [target, onClose])

  if (!target) return null

  const title =
    target.type === 'path' ? fileNameFromPath(target.path) : target.name

  return (
    <div className="attachment-preview-overlay" onClick={onClose}>
      <div className="attachment-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="attachment-preview-header">
          <div>
            <h3>{title}</h3>
            {target.type === 'path' && preview?.ok ? (
              <p className="attachment-preview-meta">{formatSize(preview.size)}</p>
            ) : null}
          </div>
          <button type="button" className="attachment-preview-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="attachment-preview-body">
          {target.type === 'image' ? (
            <img src={target.url} alt={target.name} className="attachment-preview-image" />
          ) : null}

          {target.type === 'path' && loading ? (
            <div className="attachment-preview-loading">加载中…</div>
          ) : null}

          {target.type === 'path' && !loading && preview && !preview.ok ? (
            <div className="attachment-preview-error">{preview.error}</div>
          ) : null}

          {target.type === 'path' && !loading && preview?.ok && preview.kind === 'image' ? (
            <img src={preview.dataUrl} alt={preview.name} className="attachment-preview-image" />
          ) : null}

          {target.type === 'path' && !loading && preview?.ok && preview.kind === 'text' ? (
            <pre className="attachment-preview-text">{preview.text}</pre>
          ) : null}

          {target.type === 'path' && !loading && preview?.ok && preview.kind === 'unsupported' ? (
            <div className="attachment-preview-unsupported">
              <div className="attachment-preview-file-icon">📄</div>
              <p>{preview.name}</p>
              <p className="attachment-preview-hint">
                {preview.extension} 格式暂不支持内嵌预览，发送后仍可由 AI 分析内容。
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
