import { useEffect, useRef } from 'react'

type ResizeAxis = 'e' | 's' | 'se'

export default function WindowResizeHandles() {
  const resizing = useRef<{ axis: ResizeAxis; x: number; y: number } | null>(null)

  const startResize = (axis: ResizeAxis, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = { axis, x: e.screenX, y: e.screenY }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const state = resizing.current
      if (!state) return

      const dx = e.screenX - state.x
      const dy = e.screenY - state.y
      state.x = e.screenX
      state.y = e.screenY

      const deltaW = state.axis === 'e' || state.axis === 'se' ? dx : 0
      const deltaH = state.axis === 's' || state.axis === 'se' ? dy : 0
      if (deltaW || deltaH) {
        window.dialogApi.resizeWindow(deltaW, deltaH)
      }
    }

    const onUp = () => {
      resizing.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <>
      <div
        className="resize-edge resize-edge-right"
        onMouseDown={(e) => startResize('e', e)}
        title="拖拽调整宽度"
      />
      <div
        className="resize-edge resize-edge-bottom"
        onMouseDown={(e) => startResize('s', e)}
        title="拖拽调整高度"
      />
      <div
        className="resize-grip"
        onMouseDown={(e) => startResize('se', e)}
        title="拖拽调整大小"
      />
    </>
  )
}
