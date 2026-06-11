/** 配置中的按键名 → node-global-key-listener 的 name */
const CONFIG_TO_LISTENER: Record<string, string> = {
  Space: 'SPACE',
  Enter: 'RETURN',
  Esc: 'ESCAPE',
  Escape: 'ESCAPE',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  Delete: 'DELETE',
  Up: 'UP',
  Down: 'DOWN',
  Left: 'LEFT',
  Right: 'RIGHT',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PAGE_UP',
  PageDown: 'PAGE_DOWN',
  Insert: 'INSERT'
}

/** node-global-key-listener name → 配置按键名 */
const LISTENER_TO_CONFIG: Record<string, string> = {
  SPACE: 'Space',
  RETURN: 'Enter',
  ESCAPE: 'Esc',
  TAB: 'Tab',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
  INSERT: 'Insert'
}

export function configKeyToListenerName(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (CONFIG_TO_LISTENER[trimmed]) return CONFIG_TO_LISTENER[trimmed]
  if (trimmed.length === 1) return trimmed.toUpperCase()
  if (/^F\d+$/i.test(trimmed)) return trimmed.toUpperCase()
  return trimmed.toUpperCase()
}

export function listenerNameToConfigKey(name: string): string {
  const upper = name.toUpperCase()
  return LISTENER_TO_CONFIG[upper] ?? name
}

export function normalizeCaptureKey(key: string): string | null {
  if (key.length === 1) return key === ' ' ? 'Space' : key.toUpperCase()
  const map: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert'
  }
  if (map[key]) return map[key]
  if (key.startsWith('F') && /^F\d+$/i.test(key)) return key.toUpperCase()
  return null
}

export function formatHoldKeyLabel(key: string): string {
  if (!key) return '（未设置）'
  if (key === 'Space') return '空格'
  return key
}

/** Electron before-input-event 的 key 是否匹配配置的 holdKey */
export function electronKeyMatchesHoldKey(inputKey: string, holdKey: string): boolean {
  const normalized = normalizeCaptureKey(inputKey)
  if (!normalized || !holdKey) return false
  return normalized === holdKey
}
