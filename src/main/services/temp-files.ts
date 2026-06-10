import { writeFileSync } from 'fs'
import { extname, join } from 'path'
import { tmpdir } from 'os'
import { v4 as uuidv4 } from 'uuid'

export interface TempFilePayload {
  name: string
  data: string
}

export function saveTempFiles(files: TempFilePayload[]): string[] {
  const paths: string[] = []

  for (const file of files) {
    const ext = extname(file.name) || '.bin'
    const path = join(tmpdir(), `desk-ai-${uuidv4()}${ext}`)
    const base64 = file.data.replace(/^data:[^;]+;base64,/, '')
    writeFileSync(path, Buffer.from(base64, 'base64'))
    paths.push(path)
  }

  return paths
}
