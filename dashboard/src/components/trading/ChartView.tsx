import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, createChart, createSeriesMarkers, HistogramSeries, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { fetchChartDataTrading } from '../../api'
import type { TradingChartData, ChartMarker } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

type ChartPeriod = '1mo' | '3mo' | '6mo' | '1y' | '2y'
type ChartMode = 'candlestick' | 'line'

const PERIOD_OPTIONS: Array<{ label: string; value: ChartPeriod }> = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
]

export default function ChartView() {
  const { addToast } = useToast()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick' | 'Line'> | null>(null)
  const [tickerInput, setTickerInput] = useState('AAPL')
  const [ticker, setTicker] = useState('AAPL')
  const [period, setPeriod] = useState<ChartPeriod>('6mo')
  const [chartMode, setChartMode] = useState<ChartMode>('candlestick')
  const [data, setData] = useState<TradingChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const next = await fetchChartDataTrading(ticker, period)
        setData(next)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch chart data'
        setError(message)
        setData(null)
        addToast('error', 'Chart load failed', message)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [ticker, period, addToast])

  useEffect(() => {
    if (!containerRef.current || !data || loading || error) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 520,
      layout: { background: { color: '#0e0e0e' }, textColor: '#9c9c9c' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.12)' },
    })
    chartRef.current = chart

    if (chartMode === 'candlestick') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#ffffff',
        downColor: '#8a8a8a',
        borderUpColor: '#ffffff',
        borderDownColor: '#8a8a8a',
        wickUpColor: '#ffffff',
        wickDownColor: '#8a8a8a',
      })
      candleSeries.setData(
        data.ohlcv.map(d => ({
          time: d.time as never,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      )
      seriesRef.current = candleSeries as unknown as ISeriesApi<'Candlestick' | 'Line'>

      if (data.markers.length > 0) {
        const validMarkers = data.markers
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
      const lineSeries = chart.addSeries(LineSeries, { color: '#e0e0e0', lineWidth: 2 })
      lineSeries.setData(
        data.ohlcv.map(d => ({
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
      data.ohlcv.map(d => ({
        time: d.time as never,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(255,255,255,0.3)' : 'rgba(138,138,138,0.35)',
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
      seriesRef.current = null
    }
  }, [chartMode, data, loading, error])

  const currentPrice = useMemo(() => {
    if (!data || data.ohlcv.length === 0) return null
    return data.ohlcv[data.ohlcv.length - 1].close
  }, [data])

  const applyTicker = () => {
    const next = tickerInput.trim().toUpperCase()
    if (!next || next === ticker) return
    setTicker(next)
  }

  const focusMarker = (timestamp: number) => {
    chartRef.current?.timeScale().setVisibleRange({
      from: (timestamp - 86400 * 14) as never,
      to: (timestamp + 86400 * 14) as never,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            onBlur={applyTicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyTicker()
            }}
            className="bg-surface-secondary border border-border rounded px-3 py-2 font-mono"
            placeholder="AAPL"
          />
          <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`px-3 py-1 rounded-md transition ${
                  period === option.value ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
          {(['candlestick', 'line'] as ChartMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setChartMode(mode)}
              className={`px-3 py-1 rounded-md transition ${
                chartMode === mode ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary'
              }`}
            >
              {mode === 'candlestick' ? 'Candlestick' : 'Line'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-mono font-bold text-2xl">{ticker}</h2>
            <div className="text-sm text-txt-secondary">
              {currentPrice != null ? `$${currentPrice.toFixed(2)}` : 'Price unavailable'}
            </div>
          </div>
          <span className="pill bg-surface-tertiary text-txt-secondary">{chartMode === 'candlestick' ? 'Candlestick' : 'Line'} chart</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-[520px] w-full rounded" />
          </div>
        ) : error ? (
          <EmptyState
            icon="◇"
            title="Unable to load chart data"
            subtitle="Try another ticker or period. Invalid symbols should show an error state instead of crashing the chart."
          />
        ) : !data || data.ohlcv.length === 0 ? (
          <EmptyState
            icon="◇"
            title="No price data available"
            subtitle="This ticker returned no price history for the selected period."
          />
        ) : (
          <div ref={containerRef} className="w-full h-[520px]" />
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-mono font-semibold text-sm mb-3">Signal Events</h3>
        {!data || data.markers.length === 0 ? (
          <EmptyState
            icon="◇"
            title="No signals for this ticker"
            subtitle="Generate signals to see them on the chart."
          />
        ) : (
          <div className="flex gap-3 min-w-max">
            {data.markers.map((marker: ChartMarker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => focusMarker(marker.time)}
                className="card min-w-[220px] p-4 text-left hover:border-accent-blue"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`pill text-[10px] ${
                      marker.direction === 'BUY'
                        ? 'bg-accent-green-muted text-accent-green'
                        : 'bg-accent-red-muted text-accent-red'
                    }`}
                  >
                    {marker.direction}
                  </span>
                  <span className="text-[11px] text-txt-tertiary">
                    {new Date(marker.time * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="font-mono font-bold text-sm mt-2">{ticker}</div>
                <div className="text-xs text-txt-secondary mt-1">{marker.text}</div>
                <div className="text-[11px] text-txt-tertiary mt-2">
                  Confidence {Math.round(marker.confidence * 100)}%
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
