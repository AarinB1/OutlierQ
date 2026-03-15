import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'

export default function ChartView() {
  const [ticker, setTicker] = useState('SPY')
  const [period, setPeriod] = useState('6mo')
  const [data, setData] = useState<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]>([])
  const [indicators, setIndicators] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ticker/${ticker.toUpperCase()}/price-history?period=${period}`)
      const json = await res.json()
      const prices = json.data || []
      setData(prices)

      const indRes = await fetch(`/api/ticker/${ticker.toUpperCase()}/indicators`)
      const indJson = await indRes.json()
      setIndicators(indJson)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [ticker, period])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-sans">Chart View</h2>
        <div className="flex gap-3 items-center">
          <input
            className="bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary w-28 focus:outline-none focus:border-accent-blue"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            placeholder="Ticker"
          />
          {['1mo', '3mo', '6mo', '1y', '2y'].map((p) => (
            <button
              key={p}
              className={`btn-secondary ${period === p ? '!border-accent-blue !text-accent-blue' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-[400px] w-full" />
      ) : (
        <>
          {/* Price chart */}
          <div className="card mb-4">
            <h3 className="text-lg font-bold mb-3">{ticker.toUpperCase()} Price</h3>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#8888a0', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#8888a0', fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#8888a0' }}
                />
                <Line type="monotone" dataKey="close" stroke="#448aff" strokeWidth={2} dot={false} name="Close" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Volume bars */}
          <div className="card mb-4">
            <h3 className="text-lg font-bold mb-3">Volume</h3>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={data}>
                <XAxis dataKey="date" tick={false} />
                <YAxis tick={{ fill: '#8888a0', fontSize: 10 }} />
                <Bar dataKey="volume" fill="rgba(68, 138, 255, 0.4)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Indicator cards */}
          {indicators && (
            <div className="grid grid-cols-5 gap-3">
              <IndicatorCard label="RSI (14)" value={indicators.rsi_14 as number} format="f1" signal={indicators.rsi_signal as string} />
              <IndicatorCard label="MACD" value={indicators.macd_histogram as number} format="f3" signal={indicators.macd_signal as string} />
              <IndicatorCard label="BB %B" value={indicators.bollinger_pct_b as number} format="f2" signal={indicators.bollinger_signal as string} />
              <IndicatorCard label="ATR %" value={indicators.atr_pct as number} format="f1" />
              <IndicatorCard label="Rel Volume" value={indicators.relative_volume as number} format="f2" />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function IndicatorCard({
  label,
  value,
  format,
  signal,
}: {
  label: string
  value: number | null | undefined
  format: string
  signal?: string
}) {
  if (value == null) return null
  const formatted =
    format === 'f1' ? value.toFixed(1) :
    format === 'f2' ? value.toFixed(2) :
    format === 'f3' ? value.toFixed(3) :
    String(value)

  const signalColors: Record<string, string> = {
    overbought: 'text-accent-red',
    oversold: 'text-accent-green',
    bullish: 'text-accent-green',
    bullish_cross: 'text-accent-green',
    bearish: 'text-accent-red',
    bearish_cross: 'text-accent-red',
    above_upper: 'text-accent-red',
    below_lower: 'text-accent-green',
  }

  return (
    <div className="card text-center">
      <div className="label mb-1">{label}</div>
      <div className="font-mono font-bold text-xl">{formatted}</div>
      {signal && (
        <div className={`text-xs font-mono mt-1 ${signalColors[signal] ?? 'text-txt-tertiary'}`}>
          {signal.replace('_', ' ')}
        </div>
      )}
    </div>
  )
}
