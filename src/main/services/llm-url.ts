import OpenAI from 'openai'

const DEFAULT_LLM_PORT = 7777
const COMMON_SUFFIXES = ['', '/v1', '/api/v1', '/llama/v1', '/openai/v1']

function addPortVariants(origin: string, candidates: Set<string>, port = DEFAULT_LLM_PORT): void {
  try {
    const parsed = new URL(origin)
    if (parsed.port) return
    const withPort = `${parsed.protocol}//${parsed.hostname}:${port}`
    candidates.add(withPort)
    for (const suffix of COMMON_SUFFIXES) {
      if (suffix) candidates.add(`${withPort}${suffix}`)
    }
  } catch {
    // ignore
  }
}

export function normalizeBaseUrl(url: string): string {
  let trimmed = url.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) {
    trimmed = trimmed.slice(0, -'/chat/completions'.length).replace(/\/+$/, '')
  }
  return trimmed
}

export function buildCandidateBaseUrls(configuredUrl: string): string[] {
  const normalized = normalizeBaseUrl(configuredUrl)
  const candidates = new Set<string>([normalized])

  try {
    const parsed = new URL(normalized.includes('://') ? normalized : `http://${normalized}`)
    const origin = parsed.origin
    const hasApiPath = /\/(v1|api|openai|llama)/.test(parsed.pathname)

    if (!hasApiPath) {
      for (const suffix of COMMON_SUFFIXES) {
        if (suffix) candidates.add(`${origin}${suffix}`)
      }
      addPortVariants(origin, candidates)
    }
  } catch {
    for (const suffix of COMMON_SUFFIXES) {
      if (suffix && !normalized.endsWith(suffix)) {
        candidates.add(`${normalized}${suffix}`)
      }
    }
  }

  return [...candidates]
}

export function formatLlmError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (
    lower.includes('404') ||
    lower.includes('nginx') ||
    lower.includes('<html') ||
    lower.includes('not found')
  ) {
    return [
      '大模型 API 返回 404（通常是 nginx 反代路径不对）。',
      '请在配置页尝试以下地址之一：',
      '• http://172.16.0.201:7777/v1',
      '• http://172.16.0.201/v1',
      '• http://172.16.0.201/api/v1',
      '点击「自动探测 API 路径」可自动寻找可用地址。'
    ].join('\n')
  }

  if (lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return `无法连接大模型服务：${msg}。请确认 IP/端口可达且服务已启动。`
  }

  return msg
}

export async function probeLlmBaseUrl(
  configuredUrl: string,
  model: string,
  apiKey: string
): Promise<{ ok: true; baseUrl: string; message: string } | { ok: false; message: string }> {
  const candidates = buildCandidateBaseUrls(configuredUrl)
  const errors: string[] = []

  for (const baseURL of candidates) {
    try {
      const client = new OpenAI({
        baseURL,
        apiKey: apiKey || 'not-needed',
        timeout: 20_000
      })

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: '请回复：ok' }],
        max_tokens: 8,
        temperature: 0
      })

      const text = response.choices[0]?.message?.content?.trim()
      return {
        ok: true,
        baseUrl: baseURL,
        message: text ? `连接成功，模型回复：${text}` : '连接成功'
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${baseURL} → ${msg.slice(0, 120)}`)
      const lower = msg.toLowerCase()
      if (lower.includes('model') && !lower.includes('404') && !lower.includes('nginx')) {
        return {
          ok: true,
          baseUrl: baseURL,
          message: `端点 ${baseURL} 可达，但模型名可能需调整：${msg.slice(0, 160)}`
        }
      }
    }
  }

  return {
    ok: false,
    message: [
      '未能找到可用的 OpenAI 兼容 API 路径。',
      '已尝试：',
      ...candidates.map((c) => `• ${c}`),
      '',
      '最近错误：',
      errors.slice(-3).join('\n')
    ].join('\n')
  }
}
