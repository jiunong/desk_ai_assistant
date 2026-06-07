import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { HistoryItem } from '../../shared/types'
import { getDataDir } from './config-store'

const HISTORY_FILE = 'history.json'

interface HistoryStore {
  items: HistoryItem[]
}

function getStorePath(): string {
  return join(getDataDir(), HISTORY_FILE)
}

function loadStore(): HistoryStore {
  const path = getStorePath()
  if (!existsSync(path)) return { items: [] }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as HistoryStore
  } catch {
    return { items: [] }
  }
}

function saveStore(store: HistoryStore): void {
  writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf-8')
}

export function addHistory(item: Omit<HistoryItem, 'id' | 'createdAt'>): HistoryItem {
  const store = loadStore()
  const record: HistoryItem = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    ...item
  }
  store.items.unshift(record)
  saveStore(store)
  return record
}

export function listHistory(limit = 50): HistoryItem[] {
  return loadStore().items.slice(0, limit)
}

export function getRecentContext(limit: number): HistoryItem[] {
  return listHistory(limit).reverse()
}

export function deleteHistory(id: string): void {
  const store = loadStore()
  store.items = store.items.filter((i) => i.id !== id)
  saveStore(store)
}

export function clearHistory(): void {
  saveStore({ items: [] })
}

export function trimHistory(maxItems: number): void {
  const store = loadStore()
  if (store.items.length > maxItems) {
    store.items = store.items.slice(0, maxItems)
    saveStore(store)
  }
}
