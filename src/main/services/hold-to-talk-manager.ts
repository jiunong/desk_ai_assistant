import { BrowserWindow } from 'electron'
import { configKeyToListenerName } from '../../shared/hold-key'
import type { AppConfig } from '../../shared/types'

type VoiceHoldAction = 'down' | 'up' | 'cancel'

type GlobalKeyboardListenerCtor = new () => {
  addListener: (
    cb: (e: { name?: string; state?: string; rawKey?: { name?: string } }, down: Record<string, boolean>) => void
  ) => void
  kill: () => void
}

export class HoldToTalkManager {
  private listener: InstanceType<GlobalKeyboardListenerCtor> | null = null
  private keyDown = false
  private enabled = false
  private holdKey = ''
  private useGlobal = false
  private attachedWindows = new WeakSet<BrowserWindow>()

  apply(config: AppConfig): void {
    this.shutdown()
    if (!config.asr.enabled || !config.asr.enableHoldShortcut || !config.asr.holdKey.trim()) {
      return
    }

    this.enabled = true
    this.holdKey = configKeyToListenerName(config.asr.holdKey)
    if (!this.holdKey) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('node-global-key-listener') as { GlobalKeyboardListener: GlobalKeyboardListenerCtor }
      this.listener = new mod.GlobalKeyboardListener()
      this.useGlobal = true
      this.listener.addListener((e, down) => {
        const name = (e.name ?? e.rawKey?.name ?? '').toUpperCase()
        if (name !== this.holdKey) return

        if (e.state === 'DOWN' || down[this.holdKey]) {
          if (this.keyDown) return
          this.keyDown = true
          void this.routeHold('down')
          return
        }

        if (e.state === 'UP' || !down[this.holdKey]) {
          if (!this.keyDown) return
          this.keyDown = false
          void this.routeHold('up')
        }
      })
    } catch (err) {
      console.warn('全局按住说话不可用，将仅在应用窗口内生效:', err)
      this.attachWindowListeners()
    }
  }

  private attachWindowListeners(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      this.attachToWindow(win)
    }
  }

  attachToWindow(win: BrowserWindow): void {
    if (!this.enabled || this.useGlobal) return
    if (win.isDestroyed() || this.attachedWindows.has(win)) return
    this.attachedWindows.add(win)

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' && input.type !== 'keyUp') return
      if (!this.matchesHoldKey(input.key)) return

      void this.isTypingTarget(win).then((typing) => {
        if (typing) return

        if (input.type === 'keyDown') {
          if (this.keyDown) return
          this.keyDown = true
          event.preventDefault()
          void this.routeHold('down')
        } else {
          if (!this.keyDown) return
          this.keyDown = false
          event.preventDefault()
          void this.routeHold('up')
        }
      })
    })
  }

  private matchesHoldKey(key: string): boolean {
    const normalized = key.length === 1 && key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key
    const configKey = this.holdKey === 'SPACE' ? 'Space' : this.holdKey
    return normalized === configKey || key.toUpperCase() === this.holdKey
  }

  private async isTypingTarget(win: BrowserWindow): Promise<boolean> {
    if (win.isDestroyed()) return false
    try {
      return await win.webContents.executeJavaScript(`
        (() => {
          const el = document.activeElement
          if (!el) return false
          const tag = el.tagName
          if (tag === 'TEXTAREA') return true
          if (tag === 'INPUT') {
            const type = el.type?.toLowerCase() ?? 'text'
            return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type)
          }
          return el.isContentEditable
        })()
      `)
    } catch {
      return false
    }
  }

  private async routeHold(action: VoiceHoldAction): Promise<void> {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      if (await this.isTypingTarget(focused)) {
        if (action === 'up') this.keyDown = false
        return
      }

      const url = focused.webContents.getURL()
      if (url.includes('/dialog/')) {
        focused.webContents.send('dialog:voiceHold', { action })
        return
      }
      if (url.includes('/pet/')) {
        focused.webContents.send('pet:voiceHold', { action })
        return
      }
    }

    // 延迟加载，避免与 windows 循环依赖
    const { getPetWindow } = require('../windows') as typeof import('../windows')
    const pet = getPetWindow()
    if (pet && !pet.isDestroyed() && pet.isVisible()) {
      pet.webContents.send('pet:voiceHold', { action })
    }
  }

  shutdown(): void {
    this.enabled = false
    this.keyDown = false
    this.holdKey = ''
    if (this.listener) {
      try {
        this.listener.kill()
      } catch {
        // ignore
      }
      this.listener = null
    }
    this.useGlobal = false
  }
}

export const holdToTalkManager = new HoldToTalkManager()
