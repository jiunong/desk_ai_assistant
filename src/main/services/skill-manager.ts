import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import chokidar, { FSWatcher } from 'chokidar'
import { AppConfig, SkillDefinition } from '../../shared/types'
import { getDataDir } from './config-store'

export interface SkillContext {
  files: Array<{ name: string; text: string }>
  userPrompt: string
}

export interface SkillResult {
  skillId: string
  output: string
}

type SkillHandlerFn = (ctx: SkillContext) => Promise<string> | string

export class SkillManager {
  private skills = new Map<string, SkillDefinition>()
  private handlerCache = new Map<string, SkillHandlerFn>()
  private watcher: FSWatcher | null = null
  private skillsDir = ''

  load(config: AppConfig): void {
    this.skills.clear()
    this.handlerCache.clear()
    this.skillsDir = join(getDataDir(), config.skills.directory)
    if (!existsSync(this.skillsDir)) return

    for (const file of readdirSync(this.skillsDir)) {
      if (!file.endsWith('.json')) continue
      try {
        const skill = JSON.parse(readFileSync(join(this.skillsDir, file), 'utf-8')) as SkillDefinition
        if (skill.id && skill.name) {
          this.skills.set(skill.id, skill)
        }
      } catch (err) {
        console.error(`加载 Skill 失败 [${file}]:`, err)
      }
    }
  }

  startWatch(config: AppConfig, onReload: () => void): void {
    this.stopWatch()
    const dir = join(getDataDir(), config.skills.directory)
    if (!existsSync(dir)) return

    this.watcher = chokidar.watch(dir, { ignoreInitial: true, depth: 2 })
    this.watcher.on('all', () => {
      this.load(config)
      onReload()
    })
  }

  stopWatch(): void {
    this.watcher?.close()
    this.watcher = null
  }

  list(config: AppConfig): SkillDefinition[] {
    return [...this.skills.values()].filter((s) => config.skills.enabled.includes(s.id))
  }

  match(config: AppConfig, userPrompt: string, fileExtensions: string[]): SkillDefinition[] {
    const enabled = this.list(config)
    const lower = userPrompt.toLowerCase()
    return enabled.filter((skill) =>
      skill.triggers.some((t) => lower.includes(t.toLowerCase()) || fileExtensions.some((e) => t === e))
    )
  }

  private async loadHandlerModule(moduleName: string): Promise<SkillHandlerFn | null> {
    const handlersDir = join(this.skillsDir, 'handlers')
    const candidates = [moduleName, `${moduleName}.js`, `${moduleName}.mjs`, `${moduleName}.cjs`]

    for (const name of candidates) {
      const modulePath = join(handlersDir, name)
      if (!existsSync(modulePath)) continue

      const cacheKey = `${modulePath}:${readFileSync(modulePath, 'utf-8').length}`
      if (this.handlerCache.has(cacheKey)) {
        return this.handlerCache.get(cacheKey)!
      }

      try {
        const mod = await import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`)
        const handler = (mod.default ?? mod.run) as SkillHandlerFn
        if (typeof handler === 'function') {
          this.handlerCache.set(cacheKey, handler)
          return handler
        }
      } catch (err) {
        console.error(`加载 Skill 模块失败 [${modulePath}]:`, err)
      }
    }
    return null
  }

  async run(skill: SkillDefinition, ctx: SkillContext): Promise<SkillResult> {
    if (skill.handlerModule) {
      const handler = await this.loadHandlerModule(skill.handlerModule)
      if (handler) {
        const output = await handler(ctx)
        return { skillId: skill.id, output }
      }
    }

    switch (skill.handler) {
      case 'summarize':
        return {
          skillId: skill.id,
          output: `[Skill: ${skill.name}] 已对 ${ctx.files.length} 个文件执行摘要预处理，请输出：摘要、要点、行动建议。`
        }
      case 'compare':
        return {
          skillId: skill.id,
          output: `[Skill: ${skill.name}] 共 ${ctx.files.length} 份文档，请对比：相同点、差异点、综合结论。`
        }
      default:
        return {
          skillId: skill.id,
          output: `[Skill: ${skill.name}] ${skill.description}`
        }
    }
  }
}

export const skillManager = new SkillManager()
