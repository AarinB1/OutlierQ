import { useState, useCallback, useRef, useEffect } from 'react'
import { runTradeReplay } from '../../api'
import { useToast } from '../../hooks/useToast'

const formatCurrency = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

interface ReplayBar {
  index: number
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  signal: number
  rsi_14?: number | null
  sma_20?: number | null
  sma_50?: number | null
  sma_200?: number | null
  macd?: number | null
  bb_upper?: number | null
  bb_lower?: number | null
}

export default function TradeReplay() {
  const { addToast } = useToast()
  const [ticker, setTicker] = useState('SPY')
  const [strategy, setStrategy] = useState('momentum')
  const [period, setPeriod] = useState('6mo')
  const [bars, setBars] = useState<ReplayBar[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(200) // ms per bar
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleLoad = async () => {
    setLoading(true)
    try {
      const data = await runTradeReplay({ ticker, strategy, period })
      const replayBars = (data as { bars: ReplayBar[] }).bars || []
      setBars(replayBars)
      setCurrentIdx(0)
      setPlaying(false)
      addToast('success', `Loaded ${replayBars.length} bars`)
    } catch (e: unknown) {
      addToast('error', e instanceof Error ? e.message : 'Failed to load replay')
    } finally {
      setLoading(false)
    }
  }

  const step = useCallback((dir: number) => {
    setCurrentIdx(prev => Math.max(0, Math.min(bars.length - 1, prev + dir)))
  }, [bars.length])

  useEffect(() => {
    if (playing && bars.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIdx(prev => {
          if (prev >= bars.length - 1) {
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, speed)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed, bars.length])

  const visibleBars = bars.slice(0, currentIdx + 1)
  const currentBar = bars[currentIdx] || null
  const signalBars = visibleBars.filter(b => b.signal !== 0)

  return (
    <div className="space-y-6">
      <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">Trade Replay</h2>

      {/* Config */}
      <div className="card p-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="label text-xs block mb-1">Ticker</label>
            <input
              type="text"
              className="w-20 bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Strategy</label>
            <select
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
            >
              <option value="momentum">Momentum</option>
              <option value="mean_reversion">Mean Reversion</option>
              <option value="breakout">Breakout</option>
            </select>
          </div>
          <div>
            <label className="label text-xs block mb-1">Period</label>
            <select
              className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              <option value="3mo">3 months</option>
              <option value="6mo">6 months</option>
              <option value="1y">1 year</option>
            </select>
          </div>
          <button
            className="btn-primary px-4 py-1.5 text-sm"
            onClick={handleLoad}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load Replay'}
          </button>
        </div>
      </div>

      {bars.length === 0 && !loading && (
        <div className="card">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-txt-tertiary text-3xl mb-4" aria-hidden="true">{'\u21BB'}</div>
            <p className="text-sm font-sans font-medium text-txt-primary">No replay loaded</p>
            <p className="text-xs text-txt-secondary mt-1 max-w-sm">
              Choose a ticker, strategy, and period, then Load Replay to step
              through the backtest bar by bar.
            </p>
          </div>
        </div>
      )}

      {bars.length > 0 && (
        <>
          {/* Transport Controls */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-1 bg-bg-secondary border border-border rounded text-sm hover:bg-bg-secondary/80"
                onClick={() => setCurrentIdx(0)}
              >
                |&lt;
              </button>
              <button
                className="px-3 py-1 bg-bg-secondary border border-border rounded text-sm hover:bg-bg-secondary/80"
                onClick={() => step(-1)}
              >
                &lt;
              </button>
              <button
                className={`px-4 py-1 rounded text-sm font-semibold ${playing ? 'bg-accent-red text-black' : 'bg-accent-green text-black'}`}
                onClick={() => setPlaying(p => !p)}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                className="px-3 py-1 bg-bg-secondary border border-border rounded text-sm hover:bg-bg-secondary/80"
                onClick={() => step(1)}
              >
                &gt;
              </button>
              <button
                className="px-3 py-1 bg-bg-secondary border border-border rounded text-sm hover:bg-bg-secondary/80"
                onClick={() => setCurrentIdx(bars.length - 1)}
              >
                &gt;|
              </button>

              <div className="flex items-center gap-2 ml-4">
                <label className="text-xs text-txt-secondary">Speed</label>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={50}
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  className="w-24 accent-accent-blue"
                />
                <span className="text-xs text-txt-secondary w-14">{speed}ms</span>
              </div>

              <div className="ml-auto text-sm text-txt-secondary">
                Bar {currentIdx + 1} / {bars.length}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-bg-secondary rounded-full h-1.5 mt-3">
              <div
                className="bg-accent-blue h-1.5 rounded-full transition-all duration-100"
                style={{ width: `${((currentIdx + 1) / bars.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Current Bar Details */}
          {currentBar && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="label mb-3">Current Bar — {currentBar.date.slice(0, 10)}</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-txt-secondary">Open:</span>{' '}
                    <span className="font-mono">{formatCurrency(currentBar.open)}</span>
                  </div>
                  <div>
                    <span className="text-txt-secondary">High:</span>{' '}
                    <span className="font-mono">{formatCurrency(currentBar.high)}</span>
                  </div>
                  <div>
                    <span className="text-txt-secondary">Low:</span>{' '}
                    <span className="font-mono">{formatCurrency(currentBar.low)}</span>
                  </div>
                  <div>
                    <span className="text-txt-secondary">Close:</span>{' '}
                    <span className="font-mono font-semibold">{formatCurrency(currentBar.close)}</span>
                  </div>
                  <div>
                    <span className="text-txt-secondary">Volume:</span>{' '}
                    <span className="font-mono">{currentBar.volume.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-txt-secondary">Signal:</span>{' '}
                    <span className={`font-semibold ${
                      currentBar.signal === 1 ? 'text-accent-green' :
                      currentBar.signal === -1 ? 'text-accent-red' : 'text-txt-secondary'
                    }`}>
                      {currentBar.signal === 1 ? 'BUY' : currentBar.signal === -1 ? 'SELL' : 'HOLD'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <h3 className="label mb-3">Indicators</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {currentBar.rsi_14 != null && (
                    <div>
                      <span className="text-txt-secondary">RSI(14):</span>{' '}
                      <span className={`font-mono ${
                        currentBar.rsi_14 > 70 ? 'text-accent-red' :
                        currentBar.rsi_14 < 30 ? 'text-accent-green' : ''
                      }`}>{currentBar.rsi_14.toFixed(1)}</span>
                    </div>
                  )}
                  {currentBar.sma_20 != null && (
                    <div>
                      <span className="text-txt-secondary">SMA(20):</span>{' '}
                      <span className="font-mono">{formatCurrency(currentBar.sma_20)}</span>
                    </div>
                  )}
                  {currentBar.sma_50 != null && (
                    <div>
                      <span className="text-txt-secondary">SMA(50):</span>{' '}
                      <span className="font-mono">{formatCurrency(currentBar.sma_50)}</span>
                    </div>
                  )}
                  {currentBar.sma_200 != null && (
                    <div>
                      <span className="text-txt-secondary">SMA(200):</span>{' '}
                      <span className="font-mono">{formatCurrency(currentBar.sma_200)}</span>
                    </div>
                  )}
                  {currentBar.macd != null && (
                    <div>
                      <span className="text-txt-secondary">MACD:</span>{' '}
                      <span className="font-mono">{currentBar.macd.toFixed(3)}</span>
                    </div>
                  )}
                  {currentBar.bb_upper != null && currentBar.bb_lower != null && (
                    <div>
                      <span className="text-txt-secondary">BB:</span>{' '}
                      <span className="font-mono text-xs">
                        {formatCurrency(currentBar.bb_lower)} - {formatCurrency(currentBar.bb_upper)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Signal Log */}
          {signalBars.length > 0 && (
            <div className="card p-4">
              <h3 className="label mb-3">Signal Log ({signalBars.length} signals so far)</h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-txt-secondary text-xs border-b border-border">
                      <th className="text-left py-1">Date</th>
                      <th className="text-center py-1">Signal</th>
                      <th className="text-right py-1">Close</th>
                      <th className="text-right py-1">RSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalBars.slice(-20).map(b => (
                      <tr key={b.index} className="border-b border-border/30">
                        <td className="py-1 font-mono text-xs">{b.date.slice(0, 10)}</td>
                        <td className={`py-1 text-center font-semibold ${
                          b.signal === 1 ? 'text-accent-green' : 'text-accent-red'
                        }`}>
                          {b.signal === 1 ? 'BUY' : 'SELL'}
                        </td>
                        <td className="py-1 text-right font-mono">{formatCurrency(b.close)}</td>
                        <td className="py-1 text-right font-mono">{b.rsi_14?.toFixed(1) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
