function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('读取文件失败'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function guessPastedImageName(file: File): string {
  if (file.name) return file.name
  const ext = file.type?.split('/')[1] || 'png'
  return `粘贴图片-${Date.now()}.${ext}`
}

export async function collectFilePaths(fileList: File[]): Promise<string[]> {
  if (!fileList.length) return []

  const paths: string[] = []
  const needTemp: { name: string; data: string }[] = []

  for (const file of fileList) {
    const resolved = window.dialogApi.resolvePaths([file])
    if (resolved.length) {
      paths.push(resolved[0])
      continue
    }

    const data = await readFileAsDataUrl(file)
    needTemp.push({ name: guessPastedImageName(file), data })
  }

  if (needTemp.length) {
    const tempPaths = await window.dialogApi.saveTempFiles(needTemp)
    paths.push(...tempPaths)
  }

  return paths
}

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export const FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp'
