import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync } from 'fs'
import { join } from 'path'
import { AppConfig, DEFAULT_CONFIG } from '../../shared/types'

function deepMergeConfig(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...patch,
    llm: { ...base.llm, ...patch.llm },
    pet: { ...base.pet, ...patch.pet },
    files: { ...base.files, ...patch.files },
    memory: { ...base.memory, ...patch.memory },
    mcp: patch.mcp ?? base.mcp,
    skills: patch.skills ?? base.skills,
    configServer: { ...base.configServer, ...patch.configServer },
    shortcuts: { ...base.shortcuts, ...patch.shortcuts }
  }
}

const CONFIG_FILE = 'config.json'

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'desk-ai-assistant')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, CONFIG_FILE)
}

export function loadConfig(): AppConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    saveConfig(DEFAULT_CONFIG)
    return structuredClone(DEFAULT_CONFIG)
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    return deepMergeConfig(DEFAULT_CONFIG, JSON.parse(raw) as Partial<AppConfig>)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'desk-ai-assistant')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function initSkillsFromBundle(): void {
  const skillsDir = join(getDataDir(), 'skills')
  const packaged = join(process.resourcesPath, 'skills')
  const bundleDir = existsSync(packaged) ? packaged : join(app.getAppPath(), 'skills')

  if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })
  if (!existsSync(bundleDir)) return

  for (const file of readdirSync(bundleDir)) {
    const src = join(bundleDir, file)
    const dest = join(skillsDir, file)
    if (file === 'handlers') {
      cpSync(src, dest, { recursive: true })
      continue
    }
    if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true })
    }
  }
}
