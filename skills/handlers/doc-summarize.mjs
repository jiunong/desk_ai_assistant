/** @param {{ files: Array<{name:string,text:string}>, userPrompt: string }} ctx */
export default async function run(ctx) {
  const names = ctx.files.map((f) => f.name).join('、')
  const totalChars = ctx.files.reduce((n, f) => n + f.text.length, 0)
  return [
    `[Skill: 文档摘要] 已预处理 ${ctx.files.length} 个文件（${names}），共约 ${totalChars} 字。`,
    '请按以下结构输出：',
    '1. 一句话概述',
    '2. 核心要点（条目化）',
    '3. 关键数据/结论',
    '4. 风险或待确认项',
    '5. 建议行动'
  ].join('\n')
}
