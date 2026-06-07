import { readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { parseOfficeAsync } from 'officeparser'
import * as XLSX from 'xlsx'
import { AppConfig, ImageAttachment, ParsedFile } from '../../shared/types'
import {
  documentImageToParsedFields,
  extractDocxImages,
  extractPdfImages
} from './document-images'
import { ECHARTS_JSON_RULE } from './prompt-template'

const MAX_TEXT_LENGTH = 120_000

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

export const IMAGE_EXTENSIONS = Object.keys(IMAGE_MIME)

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase())
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) return { text, truncated: false }
  return {
    text: text.slice(0, MAX_TEXT_LENGTH) + '\n\n[内容已截断...]',
    truncated: true
  }
}

async function parsePdf(path: string): Promise<string> {
  const buffer = readFileSync(path)
  const data = await pdfParse(buffer)
  return data.text
}

async function parseDocx(path: string): Promise<string> {
  const result = await mammoth.extractRawText({ path })
  return result.value
}

function appendDocumentImages(
  results: ParsedFile[],
  sourcePath: string,
  sourceName: string,
  ext: string,
  images: Awaited<ReturnType<typeof extractDocxImages>>
): void {
  for (const image of images) {
    const fields = documentImageToParsedFields(sourceName, image)
    results.push({
      path: sourcePath,
      name: fields.name,
      extension: ext,
      kind: 'image',
      text: fields.text,
      truncated: false,
      mimeType: fields.mimeType,
      imageDataUrl: fields.imageDataUrl
    })
  }
}

function parseExcel(path: string): string {
  const workbook = XLSX.readFile(path)
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    parts.push(`## Sheet: ${sheetName}\n${csv}`)
  }
  return parts.join('\n\n')
}

function parseText(path: string): string {
  return readFileSync(path, 'utf-8')
}

async function parseOffice(path: string): Promise<string> {
  return parseOfficeAsync(path)
}

function parseImage(path: string): { mimeType: string; imageDataUrl: string } {
  const ext = extname(path).toLowerCase()
  const mimeType = IMAGE_MIME[ext] ?? 'image/png'
  const buffer = readFileSync(path)
  const imageDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
  return { mimeType, imageDataUrl }
}

export function validateFiles(
  paths: string[],
  config: AppConfig
): { valid: string[]; errors: string[] } {
  const valid: string[] = []
  const errors: string[] = []
  const maxBytes = config.files.maxFileSizeMb * 1024 * 1024

  if (paths.length > config.files.maxFilesPerDrop) {
    errors.push(`最多一次拖入 ${config.files.maxFilesPerDrop} 个文件`)
  }

  for (const p of paths.slice(0, config.files.maxFilesPerDrop)) {
    const ext = extname(p).toLowerCase()
    if (!config.files.allowedExtensions.includes(ext)) {
      errors.push(`${basename(p)}: 不支持的格式 ${ext}`)
      continue
    }
    try {
      const size = statSync(p).size
      if (size > maxBytes) {
        errors.push(`${basename(p)}: 超过 ${config.files.maxFileSizeMb}MB 限制`)
        continue
      }
      valid.push(p)
    } catch {
      errors.push(`${basename(p)}: 无法读取文件`)
    }
  }
  return { valid, errors }
}

export async function parseFiles(paths: string[]): Promise<ParsedFile[]> {
  const results: ParsedFile[] = []

  for (const path of paths) {
    const ext = extname(path).toLowerCase()
    const name = basename(path)

    if (isImageExtension(ext)) {
      try {
        const { mimeType, imageDataUrl } = parseImage(path)
        results.push({
          path,
          name,
          extension: ext,
          kind: 'image',
          text: `[图片文件: ${name}]`,
          truncated: false,
          mimeType,
          imageDataUrl
        })
      } catch (err) {
        results.push({
          path,
          name,
          extension: ext,
          kind: 'image',
          text: `[图片读取失败: ${err instanceof Error ? err.message : String(err)}]`,
          truncated: false
        })
      }
      continue
    }

    let raw = ''

    let documentImages: Awaited<ReturnType<typeof extractDocxImages>> = []

    try {
      switch (ext) {
        case '.pdf': {
          raw = await parsePdf(path)
          documentImages = await extractPdfImages(path, raw.trim().length)
          break
        }
        case '.docx': {
          raw = await parseDocx(path)
          documentImages = await extractDocxImages(path)
          break
        }
        case '.doc':
          raw = await parseOffice(path)
          break
        case '.ppt':
        case '.pptx':
          raw = await parseOffice(path)
          break
        case '.xls':
        case '.xlsx':
          raw = parseExcel(path)
          break
        case '.txt':
        case '.md':
        case '.csv':
          raw = parseText(path)
          break
        default:
          raw = `[暂不支持解析 ${ext}，仅记录文件名]`
      }
    } catch (err) {
      raw = `[解析失败: ${err instanceof Error ? err.message : String(err)}]`
    }

    const { text, truncated } = truncate(raw)
    const textBody =
      documentImages.length && !raw.trim()
        ? `${text}\n\n[该文档几乎无文字内容，已自动提取 ${documentImages.length} 张内嵌/页面图片供视觉分析]`
        : documentImages.length
          ? `${text}\n\n[已从文档提取 ${documentImages.length} 张图片（插图、签名、扫描页等），将随消息一并提交视觉模型]`
          : text

    results.push({ path, name, extension: ext, kind: 'text', text: textBody, truncated })
    appendDocumentImages(results, path, name, ext, documentImages)
  }

  return results
}

export function buildDocumentPrompt(files: ParsedFile[], userPrompt?: string): string {
  const textFiles = files.filter((f) => f.kind !== 'image')
  const imageFiles = files.filter((f) => f.kind === 'image')

  const docBlocks = textFiles
    .map(
      (f, i) =>
        `### 文档 ${i + 1}: ${f.name}\n路径: ${f.path}\n${f.truncated ? '(内容已截断)\n' : ''}${f.text}`
    )
    .join('\n\n---\n\n')

  const imageBlocks = imageFiles
    .map((f, i) => {
      const fromDoc = f.text.startsWith('[文档内图片')
      const hint = fromDoc ? '（从 Word/PDF 内自动提取）' : ''
      return `### 图片 ${i + 1}: ${f.name}${hint}\n路径: ${f.path}`
    })
    .join('\n\n---\n\n')

  const defaultDocPrompt =
    `请仔细阅读以上文档，给出结构化分析（Markdown 格式）。包含：核心摘要、关键数据、问题与建议。若有数值数据，请用 \`\`\`echarts 代码块提供至少一个 ECharts 图表（合法 option JSON，${ECHARTS_JSON_RULE}）。多份文档请对比异同。`

  const defaultImagePrompt =
    '请仔细查看附带的图片，给出结构化分析（Markdown 格式）。包含：画面内容描述、关键信息提取、问题与建议。若图片含表格或数据，请尽量还原并分析。'

  const defaultMixedPrompt =
    `请结合附带的文档与图片内容，给出结构化分析（Markdown 格式）。包含：核心摘要、关键信息、问题与建议。若有数值数据，请用 \`\`\`echarts 代码块提供图表（${ECHARTS_JSON_RULE}）。`

  let prompt = userPrompt
  if (!prompt) {
    if (textFiles.length && imageFiles.length) prompt = defaultMixedPrompt
    else if (imageFiles.length) prompt = defaultImagePrompt
    else prompt = defaultDocPrompt
  }

  const blocks = [docBlocks, imageBlocks].filter(Boolean).join('\n\n---\n\n')
  return blocks ? `${prompt}\n\n${blocks}` : prompt
}

export function buildVisionUserContent(
  text: string,
  images: Array<{ imageDataUrl?: string }>
): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const imageUrls = images.map((f) => f.imageDataUrl).filter((url): url is string => Boolean(url))
  if (!imageUrls.length) return text

  const parts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text }]
  for (const url of imageUrls) {
    parts.push({ type: 'image_url', image_url: { url } })
  }
  return parts
}

export function toImageAttachments(files: ParsedFile[]): ImageAttachment[] {
  return files
    .filter((f) => f.kind === 'image' && f.imageDataUrl && f.mimeType)
    .map((f) => ({
      name: f.name,
      mimeType: f.mimeType!,
      dataUrl: f.imageDataUrl!
    }))
}
