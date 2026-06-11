import { v4 as uuidv4 } from 'uuid'
import { basename } from 'path'
import { ParsedFile, ChatMessage, ChatSession } from '../../shared/types'

const sessions = new Map<string, ChatSession>()
const MAX_SESSIONS = 50

export function createSession(
  filePaths: string[],
  files: ParsedFile[],
  usedSkills: string[] = []
): ChatSession {
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0]
    if (oldest) sessions.delete(oldest.id)
  }

  const session: ChatSession = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    filePaths,
    files,
    messages: [],
    usedSkills
  }
  sessions.set(session.id, session)
  return session
}

export function getSession(sessionId: string): ChatSession | undefined {
  return sessions.get(sessionId)
}

export function appendMessage(sessionId: string, message: ChatMessage): void {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('会话已过期，请重新打开对话')
  session.messages.push(message)
}

export function addSessionFiles(
  sessionId: string,
  filePaths: string[],
  files: ParsedFile[]
): void {
  const session = sessions.get(sessionId)
  if (!session) throw new Error('会话已过期，请重新打开对话')
  session.filePaths.push(...filePaths)
  session.files.push(...files)
}

export function getSessionSnapshot(sessionId: string): ChatSession | undefined {
  const session = sessions.get(sessionId)
  if (!session) return undefined
  return structuredClone(session)
}

export function resolveAttachmentPath(sessionId: string, fileName: string): string | null {
  const session = sessions.get(sessionId)
  if (!session) return null

  for (const message of session.messages) {
    if (!message.attachedFileNames?.length || !message.attachedFilePaths?.length) continue
    const index = message.attachedFileNames.indexOf(fileName)
    if (index >= 0 && message.attachedFilePaths[index]) {
      return message.attachedFilePaths[index]
    }
  }

  for (const path of session.filePaths) {
    if (basename(path) === fileName) return path
  }

  for (const file of session.files) {
    if (file.name === fileName) return file.path
  }

  return null
}
