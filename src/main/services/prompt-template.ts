/** 当前系统时间（注入所有对话 system prompt） */
export function buildCurrentTimeSection(date: Date = new Date()): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const formatted = date.toLocaleString('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  return [
    '## 当前时间',
    `${formatted}（时区：${timeZone}，ISO：${date.toISOString()}）`,
    '回答涉及今天、昨天、本周、现在等时间表述时请以上述系统时间为准。'
  ].join('\n')
}

/** ECharts JSON 格式约束（供其他 prompt 片段复用） */
export const ECHARTS_JSON_RULE =
  'echarts 代码块内必须是严格 JSON（标准 JSON.parse 可解析），禁止 // 行注释、/* */ 块注释及尾随逗号，否则图表渲染会失败'

/** 大模型输出格式说明（Markdown + ECharts） */
export const OUTPUT_FORMAT_INSTRUCTIONS = `
## 输出格式要求
1. 全程使用 **Markdown** 排版（标题、列表、表格、加粗等）。
2. 当涉及数据对比、趋势、占比等，必须提供 **ECharts 图表**，使用如下代码块（内容为合法 JSON，即 ECharts \`option\` 对象）。${ECHARTS_JSON_RULE}

\`\`\`echarts
{
  "title": { "text": "示例图表", "left": "center" },
  "tooltip": { "trigger": "axis" },
  "legend": { "bottom": 0 },
  "xAxis": { "type": "category", "data": ["项目A", "项目B", "项目C"] },
  "yAxis": { "type": "value" },
  "series": [{ "name": "数值", "type": "bar", "data": [120, 200, 150] }]
}
\`\`\`

3. 图表类型按数据选用：bar / line / pie 等；pie 图示例：
\`\`\`echarts
{
  "title": { "text": "占比", "left": "center" },
  "tooltip": { "trigger": "item" },
  "series": [{ "type": "pie", "radius": "55%", "data": [{"name":"A","value":40},{"name":"B","value":60}] }]
}
\`\`\`

4. 不要输出 HTML；图表只通过 \`\`\`echarts 代码块提供。
5. 再次强调：echarts 代码块中**不要写任何注释**，只输出纯 JSON 对象。
`.trim()

export function buildDirectChatSystemPrompt(petName: string): string {
  return [
    `你是桌面宠物助手「${petName}」，用户正在与你直接对话。请用中文友好回答各类问题；涉及数据时可提供 ECharts 图表。用户也可随时拖入文档或图片让你分析。`,
    OUTPUT_FORMAT_INSTRUCTIONS
  ].join('\n\n')
}

export function buildSessionSystemPrompt(
  petName: string,
  files: Array<{ name: string; text: string; truncated?: boolean; kind?: 'text' | 'image' }>
): string {
  if (!files.length) {
    return buildDirectChatSystemPrompt(petName)
  }
  const docSection = files
    .map((f, i) => {
      if (f.kind === 'image') {
        return `### 图片 ${i + 1}: ${f.name}\n（图像内容随对话消息以视觉方式提供，请结合图像分析）`
      }
      return `### 文档 ${i + 1}: ${f.name}${f.truncated ? ' (内容已截断)' : ''}\n${f.text}`
    })
    .join('\n\n---\n\n')

  const hasImages = files.some((f) => f.kind === 'image')
  const contextHint = hasImages
    ? '用户已投喂以下文档与图片作为上下文。后续对话请始终基于这些内容回答；图片细节请结合视觉输入理解。'
    : '用户已投喂以下文档作为上下文。后续对话请始终基于这些文档回答。'

  return [
    `你是桌面宠物助手「${petName}」，${contextHint}`,
    OUTPUT_FORMAT_INSTRUCTIONS,
    '## 已加载内容',
    docSection
  ].join('\n\n')
}
