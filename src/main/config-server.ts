import express from 'express'
import { join } from 'path'
import { AppConfig } from '../shared/types'
import { loadConfig, saveConfig } from './services/config-store'
import { listHistory, clearHistory, deleteHistory } from './services/memory'
import { LlmService } from './services/llm'
import { mcpManager } from './services/mcp-manager'

let server: ReturnType<express.Application['listen']> | null = null

const SPA_ROUTES = ['/', '/pet', '/history', '/mcp']

function mergeConfig(current: AppConfig, incoming: Partial<AppConfig>): AppConfig {
  return {
    ...current,
    ...incoming,
    llm: { ...current.llm, ...incoming.llm },
    pet: { ...current.pet, ...incoming.pet },
    files: { ...current.files, ...incoming.files },
    memory: { ...current.memory, ...incoming.memory },
    mcp: incoming.mcp ?? current.mcp,
    skills: incoming.skills ?? current.skills,
    configServer: { ...current.configServer, ...incoming.configServer }
  }
}

function getRendererDir(): string {
  return join(__dirname, '../renderer')
}

function setupCors(app: express.Application): void {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })
}

/** 开发模式：4789 只提供 API，页面由 Vite(5173) 承载 */
function setupConfigUiDev(app: express.Application, viteBase: string): void {
  const base = viteBase.replace(/\/+$/, '')

  app.get(SPA_ROUTES, (req, res) => {
    const target = req.path === '/' ? `${base}/config/` : `${base}/config${req.path}`
    res.redirect(302, target)
  })

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    res.redirect(302, `${base}${req.path}`)
  })
}

/** 生产模式：4789 同时提供 API 与静态页面 */
function setupConfigUiProd(app: express.Application): void {
  const rendererDir = getRendererDir()

  app.use(
    '/assets',
    express.static(join(rendererDir, 'assets'), {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8')
        if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      }
    })
  )

  for (const route of SPA_ROUTES) {
    app.get(route, (_req, res) => {
      res.sendFile(join(rendererDir, 'config/index.html'))
    })
  }
}

export function getConfigPageUrl(config?: AppConfig): string {
  const viteDevUrl = process.env['ELECTRON_RENDERER_URL']
  if (viteDevUrl) {
    return `${viteDevUrl.replace(/\/+$/, '')}/config/`
  }
  const cfg = config ?? loadConfig()
  return `http://127.0.0.1:${cfg.configServer.port}/`
}

export function startConfigServer(
  getConfig: () => AppConfig,
  onConfigUpdate: (config: AppConfig) => void
): void {
  if (server) return

  const app = express()
  setupCors(app)
  app.use(express.json())

  app.get('/api/config', (_req, res) => {
    res.json(getConfig())
  })

  app.put('/api/config', (req, res) => {
    const config = mergeConfig(getConfig(), req.body as Partial<AppConfig>)
    saveConfig(config)
    onConfigUpdate(config)
    res.json({ ok: true, config })
  })

  app.get('/api/history', (_req, res) => {
    res.json(listHistory(100))
  })

  app.delete('/api/history/:id', (req, res) => {
    deleteHistory(req.params.id)
    res.json({ ok: true })
  })

  app.delete('/api/history', (_req, res) => {
    clearHistory()
    res.json({ ok: true })
  })

  app.post('/api/llm/test', async (_req, res) => {
    const llm = new LlmService(getConfig())
    const result = await llm.testConnection()

    if (result.ok && result.baseUrl && result.baseUrl !== getConfig().llm.baseUrl) {
      const config = mergeConfig(getConfig(), { llm: { ...getConfig().llm, baseUrl: result.baseUrl } })
      saveConfig(config)
      onConfigUpdate(config)
    }

    res.json(result)
  })

  app.post('/api/llm/probe', async (_req, res) => {
    const llm = new LlmService(getConfig())
    const result = await llm.testConnection()
    if (result.ok && result.baseUrl) {
      const config = mergeConfig(getConfig(), { llm: { ...getConfig().llm, baseUrl: result.baseUrl } })
      saveConfig(config)
      onConfigUpdate(config)
    }
    res.json(result)
  })

  app.get('/api/mcp/tools', async (_req, res) => {
    const tools = await mcpManager.listTools()
    res.json(tools)
  })

  const viteDevUrl = process.env['ELECTRON_RENDERER_URL']
  if (viteDevUrl) {
    setupConfigUiDev(app, viteDevUrl)
  } else {
    setupConfigUiProd(app)
  }

  const port = getConfig().configServer.port
  server = app.listen(port, '127.0.0.1', () => {
    console.log(`配置 API: http://127.0.0.1:${port}/api`)
    console.log(`配置页面: ${getConfigPageUrl(getConfig())}`)
  })
}

export function stopConfigServer(): void {
  server?.close()
  server = null
}
