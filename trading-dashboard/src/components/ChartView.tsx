import { useState, useEffect, useRef, useCallback } from 'react'
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { fetchChartDataTrading } from '../api'
import type { TradingChartData, ChartMarker } from '../types'
import { useToast } from '../hooks/useToast'

type ChartType = 'candlestick' | 'line'
type Period = '1mo' | '3mo' | '6mo' | '1y' | '2y'

const PERIODS: { value: Period; label: string }[] = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
]

export default function ChartView() {
  const { addToast } = useToast()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick' | 'Line'> | null>(null)

  const [ticker, setTicker] = useState('AAPL')
  const [inputTicker, setInputTicker] = useState('AAPL')
  const [period, setPeriod] = useState<Period>('6mo')
  const [chartType, setChartType] = useState<ChartType>('candlestick')
  const [chartData, setChartData] = useState<TradingChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (t: string, p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchChartDataTrading(t, p)
      setChartData(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load chart data'
      setError(msg)
      addToast('error', 'Chart error', msg)
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadData(ticker, period)
  }, [ticker, period, loadData])

  useEffect(() => {
    if (!containerRef.current || !chartData || chartData.ohlcv.length === 0) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

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

    if (chartType === 'candlestick') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00d68f',
        downColor: '#ff3d5a',
        borderUpColor: '#00d68f',
        borderDownColor: '#ff3d5a',
        wickUpColor: '#00d68f',
        wickDownColor: '#ff3d5a',
      })
      candleSeries.setData(
        chartData.ohlcv.map(d => ({
          time: d.time as never,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      )
      seriesRef.current = candleSeries as unknown as ISeriesApi<'Candlestick' | 'Line'>

      if (chartData.markers.length > 0) {
        const validMarkers = chartData.markers
          .filter(m => m.time)
          .sort((a, b) => a.time - b.time)
          .map(m => ({
            time: m.time as never,
            position: m.position as 'aboveBar' | 'belowBar',
            color: m.color,
            shape: m.shape as 'arrowUp' | 'arrowDown',
            text: m.text,
          }))
        if (validMarkers.length > 0) {
          createSeriesMarkers(candleSeries, validMarkers)
        }
      }
    } else {
      const lineSeries = chart.addSeries(LineSeries, { color: '#448aff', lineWidth: 2 })
      lineSeries.setData(
        chartData.ohlcv.map(d => ({
          time: d.time as never,
          value: d.close,
        }))
      )
      seriesRef.current = lineSeries as unknown as ISeriesApi<'Candlestick' | 'Line'>
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    volumeSeries.setData(
      chartData.ohlcv.map(d => ({
        time: d.time as never,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(0,214,143,0.3)' : 'rgba(255,61,90,0.3)',
      }))
    )

    chart.timeScale().fitContent()

    const onResize = () => {
      if (!containerRef.current || !chartRef.current) return
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
    }
  }, [chartData, chartType])

  const handleTickerSubmit = () => {
    const t = inputTicker.trim().toUpperCase()
    if (t && t !== ticker) {
      setTicker(t)
    }
  }

  const lastPrice = chartData?.ohlcv?.length ? chartData.ohlcv[chartData.ohlcv.length - 1].close : null

  return (
    <div className="space-y-4">
      <h2 className="font-mono font-bold text-lg">Chart View</h2>

      {/* Controls */}
      <div className="card flex flex-wrap items-center gap-3">
        <input
          value={inputTicker}
          onChange={e => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleTickerSubmit()}
          onBlur={handleTickerSubmit}
          className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono w-24"
          placeholder="Ticker"
        />
        <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-md transition ${period === p.value ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
          <button
            onClick={() => setChartType('candlestick')}
            className={`px-3 py-1 rounded-md transition ${chartType === 'candlestick' ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary'}`}
          >
            Candlestick
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1 rounded-md transition ${chartType === 'line' ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary'}`}
          >
            Line
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="card">
        <div className="flex justify-between items-baseline mb-2">
          <div>
            <span className="font-mono font-bold text-2xl">{chartData?.ticker || ticker}</span>
            {lastPrice != null && <span className="font-mono text-lg text-txt-secondary ml-3">${lastPrice.toFixed(2)}</span>}
          </div>
        </div>
        {loading ? (
          <div className="w-full h-[420px] flex items-center justify-center">
            <div className="skeleton w-full h-full rounded" />
          </div>
        ) : error ? (
          <div className="w-full h-[420px] flex items-center justify-center">
            <div className="text-center">
              <div className="text-txt-tertiary text-4xl mb-4">◇</div>
              <p className="text-txt-secondary text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-[420px]" />
        )}
      </div>

      {/* Signal Event Strip */}
      <div className="card">
        <h3 className="font-mono font-bold text-sm mb-3">Signal Markers</h3>
        {!chartData?.markers?.length ? (
          <p className="text-txt-tertiary text-xs">No signals for this ticker. Generate signals to see them on the chart.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {chartData.markers.map((m: ChartMarker) => (
              <button
                key={m.id}
                type="button"
                className="card bg-surface-tertiary shrink-0 w-52 text-left text-xs"
                onClick={() => {
                  if (chartRef.current && m.time) {
                    chartRef.current.timeScale().scrollToPosition(-5, false)
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`pill text-[10px] ${m.direction === 'BUY' ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'}`}>
                    {m.direction}
                  </span>
                  <span className="font-mono font-bold">{chartData.ticker}</span>
                </div>
                <div className="text-txt-tertiary">{m.text}</div>
                <div className="text-txt-tertiary mt-1">{Math.round(m.confidence * 100)}% confidence</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
