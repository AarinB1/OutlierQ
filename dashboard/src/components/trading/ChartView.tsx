import { useEffect, useRef } from 'react'
import { createChart, type IChartApi, LineSeries } from 'lightweight-charts'

export default function ChartView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: { background: { color: '#12121a' }, textColor: '#c9c9d4' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.12)' },
    })
    chartRef.current = chart

    const line = chart.addSeries(LineSeries, { color: '#448aff', lineWidth: 2 })
    const now = Math.floor(Date.now() / 1000)
    line.setData(
      Array.from({ length: 100 }).map((_, i) => ({
        time: (now - (100 - i) * 86400) as never,
        value: 100 + Math.sin(i / 6) * 5 + i * 0.2,
      })),
    )

    const onResize = () => {
      if (!containerRef.current || !chartRef.current) return
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
    }
  }, [])

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Chart View</h2>
      <div className="card">
        <div className="label mb-2">Candlestick / indicator view scaffold</div>
        <div ref={containerRef} className="w-full h-[420px]" />
      </div>
    </div>
  )
}
