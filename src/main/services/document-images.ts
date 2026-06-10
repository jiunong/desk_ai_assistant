import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import JSZip from 'jszip'

const MAX_DOCX_IMAGES = 24
const MAX_PDF_IMAGES = 24
const MAX_PDF_PAGES = 12
const MIN_TEXT_FOR_PAGE_RENDER = 120
const MIN_IMAGE_BYTES = 800
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const DOCX_MEDIA_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
}

export interface ExtractedDocumentImage {
  label: string
  mimeType: string
  imageDataUrl: string
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex')
}

function toDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
}

function detectMime(buffer: Buffer): string | null {
  if (isJpeg(buffer)) return 'image/jpeg'
  if (isPng(buffer)) return 'image/png'
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 6) === 'GIF87a') return 'image/gif'
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 6) === 'GIF89a') return 'image/gif'
  if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

function acceptImageBuffer(buffer: Buffer, mimeType: string, seen: Set<string>): ExtractedDocumentImage | null {
  if (buffer.length < MIN_IMAGE_BYTES || buffer.length > MAX_IMAGE_BYTES) return null
  const hash = hashBuffer(buffer)
  if (seen.has(hash)) return null
  seen.add(hash)
  return {
    label: '',
    mimeType,
    imageDataUrl: toDataUrl(mimeType, buffer)
  }
}

export async function extractDocxImages(filePath: string): Promise<ExtractedDocumentImage[]> {
  try {
    const zip = await JSZip.loadAsync(readFileSync(filePath))
    const seen = new Set<string>()
    const images: ExtractedDocumentImage[] = []
    const mediaPrefix = 'word/media/'

    const entries = Object.keys(zip.files)
      .filter((name) => name.startsWith(mediaPrefix) && !zip.files[name].dir)
      .sort()

    for (const entryName of entries) {
      if (images.length >= MAX_DOCX_IMAGES) break

      const ext = extname(entryName).toLowerCase()
      const mimeType = DOCX_MEDIA_MIME[ext] ?? detectMime(await zip.file(entryName)!.async('nodebuffer'))
      if (!mimeType) continue

      const buffer = await zip.file(entryName)!.async('nodebuffer')
      const extracted = acceptImageBuffer(buffer, mimeType, seen)
      if (!extracted) continue

      const mediaName = basename(entryName)
      extracted.label = `内嵌图片 ${images.length + 1}（${mediaName}）`
      images.push(extracted)
    }

    return images
  } catch {
    return []
  }
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

async function loadPdfJs(): Promise<PdfJsModule> {
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

function pdfStandardFontDir(): string {
  const pkgPath = require.resolve('pdfjs-dist/package.json')
  return join(dirname(pkgPath), 'standard_fonts') + '/'
}

async function loadCanvasFactory(): Promise<{
  createCanvas: (width: number, height: number) => {
    getContext: (type: '2d') => {
      createImageData: (w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number }
      putImageData: (imageData: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) => void
    }
    toDataURL: (mime: string, quality?: number) => string
    width: number
    height: number
  }
} | null> {
  try {
    const mod = await import('@napi-rs/canvas')
    return { createCanvas: mod.createCanvas }
  } catch {
    return null
  }
}

type CanvasFactory = NonNullable<Awaited<ReturnType<typeof loadCanvasFactory>>>['createCanvas']

async function imageObjectToDataUrl(
  img: unknown,
  createCanvas?: CanvasFactory
): Promise<{ mimeType: string; imageDataUrl: string } | null> {
  if (!img || typeof img !== 'object') return null

  const record = img as Record<string, unknown>

  if (record.data instanceof Uint8Array || Buffer.isBuffer(record.data)) {
    const buffer = Buffer.from(record.data as Uint8Array)
    const mimeType = detectMime(buffer) ?? 'image/jpeg'
    return { mimeType, imageDataUrl: toDataUrl(mimeType, buffer) }
  }

  const bitmap = record.bitmap as { width?: number; height?: number; data?: Uint8ClampedArray } | undefined
  if (bitmap?.data && bitmap.width && bitmap.height && createCanvas) {
    const canvas = createCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(bitmap.width, bitmap.height)
    imageData.data.set(bitmap.data)
    ctx.putImageData(imageData, 0, 0)
    return { mimeType: 'image/png', imageDataUrl: canvas.toDataURL('image/png') }
  }

  const width = record.width as number | undefined
  const height = record.height as number | undefined
  const data = record.data as Uint8ClampedArray | undefined
  if (width && height && data && createCanvas) {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(width, height)
    imageData.data.set(data)
    ctx.putImageData(imageData, 0, 0)
    return { mimeType: 'image/png', imageDataUrl: canvas.toDataURL('image/png') }
  }

  return null
}

async function extractEmbeddedPdfImages(
  pdfjs: PdfJsModule,
  page: import('pdfjs-dist/types/src/display/api').PDFPageProxy,
  pageNum: number,
  createCanvas: CanvasFactory | undefined,
  seen: Set<string>
): Promise<ExtractedDocumentImage[]> {
  const images: ExtractedDocumentImage[] = []
  const OPS = pdfjs.OPS

  try {
    const ops = await page.getOperatorList()
    const paintOps = new Set<number>([
      OPS.paintImageXObject,
      OPS.paintJpegXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageXObjectRepeat
    ])

    for (let i = 0; i < ops.fnArray.length; i++) {
      if (images.length >= MAX_PDF_IMAGES) break
      if (!paintOps.has(ops.fnArray[i])) continue

      const args = ops.argsArray[i]
      const imgName = args?.[0]
      if (typeof imgName !== 'string') continue

      try {
        const img = await page.objs.get(imgName)
        const converted = await imageObjectToDataUrl(img, createCanvas)
        if (!converted) continue

        const buffer = Buffer.from(converted.imageDataUrl.split(',')[1] ?? '', 'base64')
        const hash = hashBuffer(buffer)
        if (seen.has(hash)) continue
        seen.add(hash)

        images.push({
          label: `第${pageNum}页内嵌图 ${images.length + 1}`,
          mimeType: converted.mimeType,
          imageDataUrl: converted.imageDataUrl
        })
      } catch {
        // 单张图提取失败时继续
      }
    }
  } catch {
    // 操作符列表不可用时跳过
  }

  return images
}

async function renderPdfPage(
  page: import('pdfjs-dist/types/src/display/api').PDFPageProxy,
  pageNum: number,
  createCanvas: CanvasFactory
): Promise<ExtractedDocumentImage | null> {
  try {
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement
    }).promise

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    const buffer = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
    if (buffer.length < MIN_IMAGE_BYTES || buffer.length > MAX_IMAGE_BYTES) return null

    return {
      label: `第${pageNum}页`,
      mimeType: 'image/jpeg',
      imageDataUrl: dataUrl
    }
  } catch {
    return null
  }
}

export async function extractPdfImages(filePath: string, textLength: number): Promise<ExtractedDocumentImage[]> {
  try {
    const pdfjs = await loadPdfJs()
    const canvasFactory = await loadCanvasFactory()
    const sparseText = textLength < MIN_TEXT_FOR_PAGE_RENDER

    const buffer = readFileSync(filePath)
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      standardFontDataUrl: pdfStandardFontDir(),
      disableFontFace: true
    }).promise

    const seen = new Set<string>()
    const images: ExtractedDocumentImage[] = []
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES)

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      if (images.length >= MAX_PDF_IMAGES) break
      const page = await doc.getPage(pageNum)

      const embedded = await extractEmbeddedPdfImages(
        pdfjs,
        page,
        pageNum,
        canvasFactory?.createCanvas,
        seen
      )
      images.push(...embedded)

      if (sparseText && canvasFactory && images.length < MAX_PDF_IMAGES) {
        const rendered = await renderPdfPage(page, pageNum, canvasFactory.createCanvas)
        if (rendered) {
          const hash = hashBuffer(Buffer.from(rendered.imageDataUrl.split(',')[1] ?? '', 'base64'))
          if (!seen.has(hash)) {
            seen.add(hash)
            images.push(rendered)
          }
        }
      }
    }

    return images.slice(0, MAX_PDF_IMAGES)
  } catch {
    return []
  }
}

export function documentImageToParsedFields(
  sourceName: string,
  image: ExtractedDocumentImage
): { name: string; mimeType: string; imageDataUrl: string; text: string } {
  return {
    name: `${sourceName} - ${image.label}`,
    mimeType: image.mimeType,
    imageDataUrl: image.imageDataUrl,
    text: `[文档内图片: ${image.label}]`
  }
}
