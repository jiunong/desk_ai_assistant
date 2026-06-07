import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { parseEchartsOption } from './parseEchartsJson'

interface Props {
  source: string
}

export default function EChartsBlock({ source }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    let option: echarts.EChartsOption
    try {
      option = parseEchartsOption(source)
    } catch {
      if (ref.current) {
        ref.current.innerHTML =
          '<div class="chart-error">图表 JSON 解析失败（请确保为无注释的严格 JSON）</div>'
      }
      return
    }

    const chart = echarts.init(ref.current)
    chart.setOption(option)

    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)

    return () => {
      window.removeEventListener('resize', onResize)
      observer.disconnect()
      chart.dispose()
    }
  }, [source])

  return <div className="echarts-block" ref={ref} />
}
