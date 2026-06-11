import { globalShortcut } from 'electron'
import { AppConfig } from '../../shared/types'

export type ShortcutHandlers = {
  openConfig: () => void
  openChat: () => void
  screenshot: () => void
  togglePet: () => void
}

const SHORTCUT_KEYS: Array<keyof AppConfig['shortcuts']> = [
  'openConfig',
  'openChat',
  'screenshot',
  'togglePet'
]

export class ShortcutManager {
  private accelerators: string[] = []

  apply(config: AppConfig, handlers: ShortcutHandlers): void {
    this.unregisterAll()

    for (const key of SHORTCUT_KEYS) {
      const accelerator = config.shortcuts[key]?.trim()
      if (!accelerator) continue

      const handler = handlers[key]
      try {
        const ok = globalShortcut.register(accelerator, handler)
        if (ok) {
          this.accelerators.push(accelerator)
        } else {
          console.error(`快捷键注册失败（可能已被占用）: ${accelerator} [${key}]`)
        }
      } catch (err) {
        console.error(`快捷键无效: ${accelerator} [${key}]`, err)
      }
    }
  }

  unregisterAll(): void {
    for (const acc of this.accelerators) {
      globalShortcut.unregister(acc)
    }
    this.accelerators = []
  }
}

export const shortcutManager = new ShortcutManager()
