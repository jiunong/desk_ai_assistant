const THINK_OPEN = '<' + 'think' + '>'
const THINK_CLOSE = '</' + 'think' + '>'
const THINK_OPEN_RE = new RegExp(THINK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
const THINK_PAIR_RE = new RegExp(
  THINK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    THINK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  'gi'
)
const THINK_TAIL_RE = new RegExp(
  THINK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*$',
  'i'
)

/** 规范化大模型输出，便于 Markdown / ECharts 正确渲染 */
export function normalizeLlmContent(content: string): string {
  if (!content) return content

  let text = content.replace(/\r\n/g, '\n').trim()

  // Qwen 等模型的思考链标签
  text = text.replace(THINK_PAIR_RE, '').trim()
  text = text.replace(THINK_TAIL_RE, '').trim()
  text = text.replace(THINK_OPEN_RE, '').trim()

  // 整段被包在 markdown 代码块里时拆包
  const wrappedFence = /^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text)
  if (wrappedFence) {
    text = wrappedFence[1].trim()
  }

  // 规范 echarts 围栏写法
  text = text.replace(/```\s+echarts\b/gi, '```echarts')

  return text
}
