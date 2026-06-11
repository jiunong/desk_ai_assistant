export type EditorTool = 'rect' | 'circle' | 'text'

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'circle'; x: number; y: number; w: number; h: number }
  | { type: 'text'; x: number; y: number; text: string }

export type ImageDisplayRect = { x: number; y: number; w: number; h: number }

const STROKE = '#ff3b30'
const STROKE_WIDTH = 2
const TEXT_SIZE = 16

export function getImageDisplayRect(
  wrap: HTMLElement,
  image: HTMLImageElement
): ImageDisplayRect {
  const ww = wrap.clientWidth
  const wh = wrap.clientHeight
  const nw = image.naturalWidth
  const nh = image.naturalHeight
  if (!nw || !nh) return { x: 0, y: 0, w: ww, h: wh }

  const scale = Math.min(ww / nw, wh / nh)
  const w = nw * scale
  const h = nh * scale
  return { x: (ww - w) / 2, y: (wh - h) / 2, w, h }
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  wrap: HTMLElement,
  image: HTMLImageElement
): { x: number; y: number } | null {
  const wrapRect = wrap.getBoundingClientRect()
  const img = getImageDisplayRect(wrap, image)
  const lx = clientX - wrapRect.left - img.x
  const ly = clientY - wrapRect.top - img.y
  if (lx < 0 || ly < 0 || lx > img.w || ly > img.h) return null
  return { x: lx / img.w, y: ly / img.h }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  img: ImageDisplayRect,
  forExport: boolean,
  exportW: number,
  exportH: number
): void {
  const ox = forExport ? 0 : img.x
  const oy = forExport ? 0 : img.y
  const iw = forExport ? exportW : img.w
  const ih = forExport ? exportH : img.h

  ctx.strokeStyle = STROKE
  ctx.fillStyle = STROKE
  ctx.lineWidth = forExport ? Math.max(2, exportW / 800) : STROKE_WIDTH

  if (shape.type === 'rect') {
    const x = ox + shape.x * iw
    const y = oy + shape.y * ih
    const w = shape.w * iw
    const h = shape.h * ih
    ctx.strokeRect(x, y, w, h)
    return
  }

  if (shape.type === 'circle') {
    const x = ox + shape.x * iw
    const y = oy + shape.y * ih
    const w = shape.w * iw
    const h = shape.h * ih
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
    return
  }

  const fontSize = forExport ? Math.max(14, exportW / 60) : TEXT_SIZE
  ctx.font = `bold ${fontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(shape.text, ox + shape.x * iw, oy + shape.y * ih)
}

export function redrawAnnotations(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement,
  image: HTMLImageElement,
  shapes: Shape[],
  previewShape: Shape | null
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = wrap.clientWidth
  canvas.height = wrap.clientHeight
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const img = getImageDisplayRect(wrap, image)
  for (const shape of shapes) {
    drawShape(ctx, shape, img, false, 0, 0)
  }
  if (previewShape) {
    ctx.setLineDash([6, 4])
    drawShape(ctx, previewShape, img, false, 0, 0)
    ctx.setLineDash([])
  }
}

export function exportAnnotatedImage(
  image: HTMLImageElement,
  wrap: HTMLElement,
  shapes: Shape[]
): string {
  const nw = image.naturalWidth
  const nh = image.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, nw)
  canvas.height = Math.max(1, nh)
  const ctx = canvas.getContext('2d')
  if (!ctx) return image.src

  ctx.drawImage(image, 0, 0, nw, nh)
  const img = getImageDisplayRect(wrap, image)
  for (const shape of shapes) {
    drawShape(ctx, shape, img, true, nw, nh)
  }
  return canvas.toDataURL('image/png')
}

export function normalizeBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  return { x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
}
