import {
  clientToNormalized,
  exportAnnotatedImage,
  getImageDisplayRect,
  normalizeBox,
  redrawAnnotations,
  type EditorTool,
  type Shape
} from './editor'

const phaseSelect = document.getElementById('phase-select')!
const phasePreview = document.getElementById('phase-preview')!
const overlay = document.getElementById('overlay')!
const selection = document.getElementById('selection')!
const hint = document.getElementById('hint')!
const capturingHint = document.getElementById('capturing-hint')!
const sizeLabel = document.getElementById('size-label')!
const previewPanel = document.getElementById('preview-panel')!
const previewImage = document.getElementById('preview-image') as HTMLImageElement
const previewSize = document.getElementById('preview-size')!
const previewImageWrap = document.getElementById('preview-image-wrap')!
const annotationCanvas = document.getElementById('annotation-canvas') as HTMLCanvasElement
const textEditor = document.getElementById('text-editor') as HTMLInputElement
const captionInput = document.getElementById('caption-input') as HTMLTextAreaElement
const resizeHandle = document.getElementById('resize-handle')!
const btnCancel = document.getElementById('btn-cancel')!
const btnSend = document.getElementById('btn-send')!
const btnUndo = document.getElementById('btn-undo')!
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('#editor-toolbar [data-tool]')]

const MIN_PANEL_W = 360
const MIN_PANEL_H = 320
const HEADER_H = 36
const TOOLBAR_H = 44
const CAPTION_H = 72
const ACTIONS_H = 52

let selectStartX = 0
let selectStartY = 0
let selecting = false
let currentBounds = { x: 0, y: 0, width: 0, height: 0 }

let panelRect = { left: 0, top: 0, width: 480, height: 400 }
let draggingPanel = false
let resizingPanel = false
let dragStart = { x: 0, y: 0, left: 0, top: 0 }
let resizeStart = { x: 0, y: 0, width: 0, height: 0 }

let currentTool: EditorTool = 'rect'
let shapes: Shape[] = []
let previewShape: Shape | null = null
let drawStart: { x: number; y: number } | null = null
let drawing = false
let pendingTextPoint: { x: number; y: number } | null = null

function windowOffset(): { x: number; y: number } {
  return { x: window.screenX - window.scrollX, y: window.screenY - window.scrollY }
}

function refreshCanvas(): void {
  redrawAnnotations(annotationCanvas, previewImageWrap, previewImage, shapes, previewShape)
}

function setTool(tool: EditorTool): void {
  currentTool = tool
  hideTextEditor()
  toolButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool)
  })
  annotationCanvas.classList.toggle('tool-text', tool === 'text')
}

function appendCaption(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  captionInput.value = captionInput.value.trim()
    ? `${captionInput.value.trim()}\n${trimmed}`
    : trimmed
}

function hideTextEditor(): void {
  textEditor.style.display = 'none'
  pendingTextPoint = null
}

function confirmTextEditor(): void {
  if (!pendingTextPoint) return
  const text = textEditor.value.trim()
  if (text) {
    shapes.push({ type: 'text', x: pendingTextPoint.x, y: pendingTextPoint.y, text })
    appendCaption(text)
    refreshCanvas()
  }
  textEditor.value = ''
  hideTextEditor()
}

function updateSelection(x: number, y: number, w: number, h: number): void {
  currentBounds = { x, y, width: w, height: h }
  const offset = windowOffset()
  selection.style.display = 'block'
  selection.style.left = `${x - offset.x}px`
  selection.style.top = `${y - offset.y}px`
  selection.style.width = `${w}px`
  selection.style.height = `${h}px`
  sizeLabel.style.display = 'block'
  sizeLabel.style.left = `${x - offset.x}px`
  sizeLabel.style.top = `${Math.max(0, y - offset.y - 28)}px`
  sizeLabel.textContent = `${Math.round(w)} × ${Math.round(h)}`
}

function confirmSelection(): void {
  if (currentBounds.width < 4 || currentBounds.height < 4) {
    window.screenshotApi.cancel()
    return
  }
  window.screenshotApi.complete(currentBounds)
}

function setPanelRect(left: number, top: number, width: number, height: number): void {
  panelRect = {
    left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
    width: Math.max(MIN_PANEL_W, Math.min(width, window.innerWidth - 16)),
    height: Math.max(MIN_PANEL_H, Math.min(height, window.innerHeight - 16))
  }
  previewPanel.style.left = `${panelRect.left}px`
  previewPanel.style.top = `${panelRect.top}px`
  previewPanel.style.width = `${panelRect.width}px`
  previewPanel.style.height = `${panelRect.height}px`
  previewSize.textContent = `${Math.round(panelRect.width)} × ${Math.round(panelRect.height)}`
  requestAnimationFrame(refreshCanvas)
}

function showPreview(
  dataUrl: string,
  bounds: { x: number; y: number; width: number; height: number }
): void {
  document.body.classList.remove('select-mode')
  document.body.classList.add('preview-mode')
  phaseSelect.style.display = 'none'
  phasePreview.style.display = 'block'

  shapes = []
  previewShape = null
  captionInput.value = ''
  hideTextEditor()
  setTool('rect')

  previewImage.onload = () => refreshCanvas()
  previewImage.src = dataUrl

  const aspect = bounds.width / bounds.height
  const chrome = HEADER_H + TOOLBAR_H + CAPTION_H + ACTIONS_H
  let width = Math.min(Math.max(bounds.width, 420), window.innerWidth * 0.75)
  let height = width / aspect + chrome
  if (height > window.innerHeight * 0.82) {
    height = window.innerHeight * 0.82
    width = (height - chrome) * aspect
  }
  width = Math.max(MIN_PANEL_W, width)
  height = Math.max(MIN_PANEL_H, height)

  const offset = windowOffset()
  const left = bounds.x + bounds.width / 2 - width / 2 - offset.x
  const top = bounds.y + bounds.height / 2 - height / 2 - offset.y
  setPanelRect(left, top, width, height)
}

function sendToDialog(): void {
  window.screenshotApi.send({
    dataUrl: exportAnnotatedImage(previewImage, previewImageWrap, shapes),
    text: captionInput.value.trim()
  })
}

function onSelectMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  selecting = true
  selectStartX = e.screenX
  selectStartY = e.screenY
  updateSelection(selectStartX, selectStartY, 0, 0)
}

function onSelectMouseMove(e: MouseEvent): void {
  if (!selecting) return
  const x = Math.min(selectStartX, e.screenX)
  const y = Math.min(selectStartY, e.screenY)
  const w = Math.abs(e.screenX - selectStartX)
  const h = Math.abs(e.screenY - selectStartY)
  updateSelection(x, y, w, h)
}

function onSelectMouseUp(e: MouseEvent): void {
  if (!selecting || e.button !== 0) return
  selecting = false
  if (currentBounds.width >= 4 && currentBounds.height >= 4) {
    confirmSelection()
  }
}

function onPanelMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('#preview-actions') || target.closest('#editor-toolbar') || target.closest('#caption-row')) {
    return
  }

  if (target === resizeHandle || target.closest('#resize-handle')) {
    resizingPanel = true
    resizeStart = { x: e.clientX, y: e.clientY, width: panelRect.width, height: panelRect.height }
    e.preventDefault()
    return
  }

  if (target.closest('#preview-header')) {
    draggingPanel = true
    dragStart = { x: e.clientX, y: e.clientY, left: panelRect.left, top: panelRect.top }
    e.preventDefault()
  }
}

function onCanvasMouseDown(e: MouseEvent): void {
  if (e.button !== 0 || textEditor.style.display === 'block') return
  e.stopPropagation()

  const point = clientToNormalized(e.clientX, e.clientY, previewImageWrap, previewImage)
  if (!point) return

  if (currentTool === 'text') {
    const img = getImageDisplayRect(previewImageWrap, previewImage)
    pendingTextPoint = point
    textEditor.value = ''
    textEditor.style.left = `${img.x + point.x * img.w}px`
    textEditor.style.top = `${img.y + point.y * img.h}px`
    textEditor.style.display = 'block'
    textEditor.focus()
    return
  }

  drawing = true
  drawStart = point
  previewShape = { type: currentTool, x: point.x, y: point.y, w: 0, h: 0 }
}

function onCanvasMouseMove(e: MouseEvent): void {
  if (!drawing || !drawStart || !previewShape) return
  const point = clientToNormalized(e.clientX, e.clientY, previewImageWrap, previewImage)
  if (!point) return
  const box = normalizeBox(drawStart.x, drawStart.y, point.x, point.y)
  previewShape = { type: currentTool, ...box }
  refreshCanvas()
}

function onCanvasMouseUp(e: MouseEvent): void {
  if (!drawing || e.button !== 0 || !previewShape) return
  drawing = false
  drawStart = null
  if (previewShape.w > 0.008 && previewShape.h > 0.008) {
    shapes.push({ ...previewShape })
  }
  previewShape = null
  refreshCanvas()
}

function onPanelMouseMove(e: MouseEvent): void {
  if (draggingPanel) {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setPanelRect(dragStart.left + dx, dragStart.top + dy, panelRect.width, panelRect.height)
    return
  }

  if (resizingPanel) {
    const dx = e.clientX - resizeStart.x
    const dy = e.clientY - resizeStart.y
    setPanelRect(panelRect.left, panelRect.top, resizeStart.width + dx, resizeStart.height + dy)
  }

  onCanvasMouseMove(e)
}

function onPanelMouseUp(e: MouseEvent): void {
  draggingPanel = false
  resizingPanel = false
  onCanvasMouseUp(e)
}

function onKeyDown(e: KeyboardEvent): void {
  const inCaption = e.target === captionInput
  const inTextEditor = e.target === textEditor

  if (phasePreview.style.display === 'block') {
    if (inTextEditor) {
      if (e.key === 'Enter') {
        e.preventDefault()
        confirmTextEditor()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        hideTextEditor()
      }
      return
    }

    if (inCaption) return

    if (e.key === 'Escape') {
      e.preventDefault()
      window.screenshotApi.cancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      sendToDialog()
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    window.screenshotApi.cancel()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmSelection()
  }
}

window.screenshotApi.onCapturing(() => {
  hint.style.display = 'none'
  capturingHint.style.display = 'block'
  selection.style.display = 'none'
  sizeLabel.style.display = 'none'
  overlay.style.pointerEvents = 'none'
})

window.screenshotApi.onPreview(({ dataUrl, bounds }) => {
  showPreview(dataUrl, bounds)
})

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setTool(btn.dataset.tool as EditorTool)
  })
})

btnUndo.addEventListener('click', () => {
  shapes.pop()
  previewShape = null
  refreshCanvas()
})

textEditor.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmTextEditor()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    hideTextEditor()
  }
})

textEditor.addEventListener('blur', () => {
  if (pendingTextPoint) confirmTextEditor()
})

overlay.addEventListener('mousedown', onSelectMouseDown)
annotationCanvas.addEventListener('mousedown', onCanvasMouseDown)
window.addEventListener('mousemove', (e) => {
  onSelectMouseMove(e)
  onPanelMouseMove(e)
})
window.addEventListener('mouseup', (e) => {
  onSelectMouseUp(e)
  onPanelMouseUp(e)
})
previewPanel.addEventListener('mousedown', onPanelMouseDown)
window.addEventListener('keydown', onKeyDown)
window.addEventListener('resize', refreshCanvas)

btnCancel.addEventListener('click', () => window.screenshotApi.cancel())
btnSend.addEventListener('click', sendToDialog)

previewImage.addEventListener('load', refreshCanvas)
