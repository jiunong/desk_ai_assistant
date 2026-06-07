import type { EChartsOption } from 'echarts'

function stripJsonComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim()
}

export function parseEchartsOption(source: string): EChartsOption {
  const trimmed = source.trim()
  try {
    return JSON.parse(trimmed) as EChartsOption
  } catch {
    return JSON.parse(stripJsonComments(trimmed)) as EChartsOption
  }
}

export function isEchartsOptionJson(raw: string): boolean {
  try {
    const obj = JSON.parse(stripJsonComments(raw.trim())) as Record<string, unknown>
    if (!obj || typeof obj !== 'object') return false
    return (
      'series' in obj ||
      'xAxis' in obj ||
      'yAxis' in obj ||
      'radar' in obj ||
      'geo' in obj ||
      ('dataset' in obj && 'series' in obj)
    )
  } catch {
    return false
  }
}
