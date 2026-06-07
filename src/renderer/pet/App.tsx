import { useCallback, useEffect, useRef, useState } from 'react'
import type { PetState } from '../../shared/global.d'
import PetCharacter from './PetCharacter'

export default function App() {
  const [state, setState] = useState<PetState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [petName, setPetName] = useState('小智')
  const [petSize, setPetSize] = useState(180)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const preDragState = useRef<PetState>('idle')
  const stateRef = useRef<PetState>(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const applyConfig = (c: { name: string; size: number }) => {
    setPetName(c.name)
    setPetSize(c.size)
  }

  useEffect(() => {
    window.petApi.getConfig().then(applyConfig)
    window.petApi.onSetState(setState)
    window.petApi.onConfigUpdated(applyConfig)
    window.petApi.onError((msg) => {
      setError(msg)
      setBusy(false)
      setTimeout(() => setError(''), 5000)
    })
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    preDragState.current = stateRef.current
    dragging.current = true
    dragStart.current = { x: e.screenX, y: e.screenY }
    setState('dragging')
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.screenX - dragStart.current.x
      const dy = e.screenY - dragStart.current.y
      if (dx || dy) {
        window.petApi.moveWindow(dx, dy)
        dragStart.current = { x: e.screenX, y: e.screenY }
      }
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      setState((current) => (current === 'dragging' ? preDragState.current : current))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (busy) return

    const fileList = [...e.dataTransfer.files]
    if (!fileList.length) return

    const paths = window.petApi.resolvePaths(fileList)
    if (!paths.length) {
      setError('无法读取文件路径，请从资源管理器直接拖入')
      return
    }

    setBusy(true)
    try {
      await window.petApi.dropFiles(paths)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
      setBusy(false)
    }
  }, [busy])

  const openChat = useCallback(async () => {
    if (busy) return
    try {
      await window.petApi.openChat()
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开对话失败')
    }
  }, [busy])

  useEffect(() => {
    if (state === 'idle' || state === 'talking') {
      if (state === 'idle') setBusy(false)
    }
  }, [state])

  const stageHeight = Math.round(petSize * 1.35)

  return (
    <div
      className={`pet-container state-${state} ${dragOver ? 'drag-over' : ''} ${busy ? 'is-busy' : ''}`}
      onMouseDown={onMouseDown}
      onDragEnter={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      {error && <div className="pet-toast">{error}</div>}
      {dragOver && <div className="drop-ring" />}

      <div className="pet-stage" style={{ width: petSize, height: stageHeight }}>
        <PetCharacter state={state} size={petSize} />
        {!busy && (
          <button
            type="button"
            className="pet-chat-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void openChat()
            }}
            title="开始对话"
            aria-label="开始对话"
          >
            <span className="pet-chat-icon" aria-hidden>
              💬
            </span>
          </button>
        )}
      </div>

      <div className="pet-name">{petName}</div>

      {(busy || dragOver) && (
        <div className="pet-hint">{busy ? '正在处理...' : '松开即可投喂'}</div>
      )}
    </div>
  )
}
