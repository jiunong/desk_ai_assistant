import { existsSync, readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
const TEXT_EXT = ['.txt', '.md', '.csv', '.json', '.log', '.xml', '.html', '.htm', '.yaml', '.yml']

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

const MAX_TEXT = 80_000

export type FilePreviewResult =
  | { ok: true; kind: 'image'; name: string; dataUrl: string; size: number }
  | { ok: true; kind: 'text'; name: string; text: string; truncated: boolean; size: number }
  | { ok: true; kind: 'unsupported'; name: string; size: number; extension: string }
  | { ok: false; error: string }

export function previewFile(filePath: string): FilePreviewResult {
  if (!filePath?.trim()) {
    return { ok: false, error: '无效的文件路径' }
  }

  if (!existsSync(filePath)) {
    return { ok: false, error: '文件不存在或已被删除' }
  }

  try {
    const stat = statSync(filePath)
    const name = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    if (IMAGE_EXT.includes(ext)) {
      const buffer = readFileSync(filePath)
      const mime = IMAGE_MIME[ext] ?? 'image/png'
      return {
        ok: true,
        kind: 'image',
        name,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        size: stat.size
      }
    }

    if (TEXT_EXT.includes(ext)) {
      const raw = readFileSync(filePath, 'utf-8')
      const truncated = raw.length > MAX_TEXT
      return {
        ok: true,
        kind: 'text',
        name,
        text: truncated ? `${raw.slice(0, MAX_TEXT)}\n\n[内容已截断...]` : raw,
        truncated,
        size: stat.size
      }
    }

    return {
      ok: true,
      kind: 'unsupported',
      name,
      size: stat.size,
      extension: ext || '未知'
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '读取文件失败' }
  }
}
