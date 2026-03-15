import { useState } from 'react'
import type { BacktestResult } from '../types'
import { api } from '../api'

interface StrategyConfig {
  name: string
  label: string
  params: { key: string; label: string; default: number; min: number; max: number; step: number }[]
}

const STRATEGIES: StrategyConfig[] = [
  {
    name: 'momentum',
    label: 'Momentum',
    params: [
      { key: 'rsi_low', label: 'RSI Low', default: 40, min: 20, max: 60, step: 5 },
      { key: 'rsi_high', label: 'RSI High', default: 70, min: 50, max: 90, step: 5 },
      { key: 'adx_threshold', label: 'ADX Threshold', default: 25, min: 15, max: 40, step: 5 },
      { key: 'volume_threshold', label: 'Volume Multiplier', default: 1.5, min: 1.0, max: 3.0, step: 0.1 },
      { key: 'atr_stop_multiplier', label: 'Stop (ATR x)', default: 2.0, min: 1.0, max: 4.0, step: 0.5 },
      { key: 'atr_target_multiplier', label: 'Target (ATR x)', default: 3.0, min: 1.5, max: 6.0, step: 0.5 },
    ],
  },
  {
    name: 'mean_reversion',
    label: 'Mean Reversion',
    params: [
      { key: 'rsi2_buy_threshold', label: 'RSI(2) Buy', default: 10, min: 5, max: 25, step: 5 },
      { key: 'rsi2_short_threshold', label: 'RSI(2) Short', default: 90, min: 75, max: 95, step: 5 },
      { key: 'vwap_deviation_threshold', label: 'VWAP Dev %', default: 1.5, min: 0.5, max: 3.0, step: 0.25 },
      { key: 'atr_stop_multiplier', label: 'Stop (ATR x)', default: 1.5, min: 1.0, max: 3.0, step: 0.5 },
    ],
  },
  {
    name: 'breakout',
    label: 'Breakout',
    params: [
      { key: 'lookback', label: 'Lookback Days', default: 20, min: 10, max: 50, step: 5 },
      { key: 'volume_multiplier', label: 'Volume Multiplier', default: 2.0, min: 1.5, max: 4.0, step: 0.5 },
      { key: 'atr_stop_multiplier', label: 'Stop (ATR x)', default: 2.0, min: 1.0, max: 4.0, step: 0.5 },
      { key: 'atr_target_multiplier', label: 'Target (ATR x)', default: 3.0, min: 1.5, max: 6.0, step: 0.5 },
    ],
  },
]

export default function StrategyBuilder() {
  const [selectedStrategy, setSelectedStrategy] = useState(0)
  const [params, setParams] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {}
    STRATEGIES[0].params.forEach((p) => (defaults[p.key] = p.default))
    return defaults
  })
  const [ticker, setTicker] = useState('SPY')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)

  const strategy = STRATEGIES[selectedStrategy]

  const handleStrategyChange = (idx: number) => {
    setSelectedStrategy(idx)
    const defaults: Record<string, number> = {}
    STRATEGIES[idx].params.forEach((p) => (defaults[p.key] = p.default))
    setParams(defaults)
    setResult(null)
  }

  const quickBacktest = async () => {
    setRunning(true)
    try {
      const res = await api.runBacktest({
        ticker: ticker.toUpperCase(),
        strategy: strategy.name,
        period: '1y',
        params,
      })
      setResult(res)
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold font-sans mb-6">Strategy Builder</h2>

      <div className="grid grid-cols-3 gap-6">
        {/* Strategy selector */}
        <div className="col-span-1 space-y-3">
          {STRATEGIES.map((s, i) => (
            <button
              key={s.name}
              onClick={() => handleStrategyChange(i)}
              className={`w-full card text-left ${
                selectedStrategy === i ? '!border-accent-blue' : ''
              }`}
            >
              <div className="font-bold">{s.label}</div>
              <div className="text-xs text-txt-tertiary mt-1">{s.params.length} parameters</div>
            </button>
          ))}
        </div>

        {/* Parameters */}
        <div className="col-span-2">
          <div className="card mb-4">
            <h3 className="text-lg font-bold mb-4">{strategy.label} Parameters</h3>
            <div className="space-y-4">
              {strategy.params.map((p) => (
                <div key={p.key} className="flex items-center gap-4">
                  <label className="text-sm text-txt-secondary w-40">{p.label}</label>
                  <input
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={params[p.key] ?? p.default}
                    onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })}
                    className="flex-1 accent-accent-blue"
                  />
                  <span className="font-mono text-sm w-16 text-right">
                    {(params[p.key] ?? p.default).toFixed(p.step < 1 ? 1 : 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick backtest */}
          <div className="card">
            <div className="flex items-center gap-4 mb-4">
              <input
                className="bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary w-32 focus:outline-none focus:border-accent-blue"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Ticker"
              />
              <button className="btn-primary" onClick={quickBacktest} disabled={running}>
                {running ? 'Testing...' : 'Quick Backtest'}
              </button>
            </div>

            {result && (
              <div className="grid grid-cols-4 gap-3">
                <MiniStat label="Sharpe" value={result.metrics.sharpe_ratio.toFixed(2)} />
                <MiniStat label="Return" value={`${result.metrics.total_return_pct.toFixed(1)}%`} color={result.metrics.total_return_pct >= 0 ? 'green' : 'red'} />
                <MiniStat label="Win Rate" value={`${(result.metrics.win_rate * 100).toFixed(0)}%`} />
                <MiniStat label="Max DD" value={`${result.metrics.max_drawdown_pct.toFixed(1)}%`} color="red" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = color === 'green' ? 'text-accent-green' : color === 'red' ? 'text-accent-red' : 'text-txt-primary'
  return (
    <div className="bg-surface-tertiary rounded-lg p-3 text-center">
      <div className="text-xs text-txt-tertiary mb-1">{label}</div>
      <div className={`font-mono font-bold ${c}`}>{value}</div>
    </div>
  )
}
