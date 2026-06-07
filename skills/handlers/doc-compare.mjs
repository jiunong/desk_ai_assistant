/** @param {{ files: Array<{name:string,text:string}>, userPrompt: string }} ctx */
export default async function run(ctx) {
  if (ctx.files.length < 2) {
    return '[Skill: 多文档对比] 当前仅 1 个文件，请仍给出结构化摘要，并提示用户可拖入多文件以启用对比。'
  }
  const list = ctx.files.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
  return [
    `[Skill: 多文档对比] 检测到 ${ctx.files.length} 份文档：`,
    list,
    '',
    '请输出：相同点、差异点、各文档独有信息、综合结论。'
  ].join('\n')
}
