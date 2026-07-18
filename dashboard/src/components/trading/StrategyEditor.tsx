import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { runDSLBacktest } from '../../api'
import { useToast } from '../../hooks/useToast'
import type { DslBacktestResult } from '../../types'

const EXAMPLE_RULES = `BUY WHEN rsi_14 < 30 AND close > sma_200
SELL WHEN rsi_14 > 70 OR close < sma_200
STOP_LOSS = atr_14 * 2
TAKE_PROFIT = atr_14 * 3`

const DSL_HELP = [
  { keyword: 'BUY WHEN', desc: 'Define buy condition' },
  { keyword: 'SELL WHEN', desc: 'Define sell condition' },
  { keyword: 'STOP_LOSS =', desc: 'Distance below entry to stop out' },
  { keyword: 'TAKE_PROFIT =', desc: 'Distance above entry to take profit' },
  { keyword: 'AND / OR / NOT', desc: 'Logical operators' },
  { keyword: '< > <= >= == !=', desc: 'Comparison operators' },
  { keyword: '+ - * /', desc: 'Math operators' },
]

const AVAILABLE_COLUMNS = [
  'close', 'open', 'high', 'low', 'volume',
  'rsi_14', 'sma_20', 'sma_50', 'sma_200', 'ema_9', 'ema_21',
  'macd', 'macd_signal', 'macd_histogram',
  'bb_upper', 'bb_lower', 'bb_middle',
  'atr_14', 'adx_14', 'relative_volume',
]

const formatCurrency = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`


export default function StrategyEditor() {
  const { addToast } = useToast()
  const [rules, setRules] = useState(EXAMPLE_RULES)
  const [ticker, setTicker] = useState('SPY')
  const [period, setPeriod] = useState('1y')
  const [capital, setCapital] = useState(100000)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DslBacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await runDSLBacktest({ rules, ticker, period, initial_capital: capital })
      setResult(data)
      addToast('success', 'DSL backtest complete')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Backtest failed'
      setError(msg)
      addToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  const equityData = result?.equity_curve
    ? result.equity_curve.dates.map((d, i) => ({
        date: d.slice(0, 10),
        value: result.equity_curve.values[i],
      }))
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">Strategy Editor (DSL)</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4">
            <label className="label block mb-2">Strategy Rules</label>
            <textarea
              className="w-full h-48 bg-bg-secondary border border-border rounded-lg p-3 font-mono text-sm text-txt-primary resize-y focus:outline-none focus:ring-2 focus:ring-accent-blue"
              value={rules}
              onChange={e => setRules(e.target.value)}
              placeholder="BUY WHEN rsi_14 < 30 AND close > sma_200"
              spellCheck={false}
            />

            <div className="flex gap-3 mt-3">
              <div className="flex items-center gap-2">
                <label className="label text-xs">Ticker</label>
                <input
                  type="text"
                  className="w-20 bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="label text-xs">Period</label>
                <select
                  className="bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                >
                  <option value="6mo">6 months</option>
                  <option value="1y">1 year</option>
                  <option value="2y">2 years</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="label text-xs">Capital</label>
                <input
                  type="number"
                  className="w-28 bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
                  value={capital}
                  onChange={e => setCapital(Number(e.target.value))}
                />
              </div>
              <button
                className="btn-primary px-4 py-1.5 text-sm ml-auto"
                onClick={handleRun}
                disabled={loading || !rules.trim()}
              >
                {loading ? 'Running...' : 'Run Backtest'}
              </button>
            </div>
            {error && <p className="text-accent-red text-sm mt-2">{error}</p>}
          </div>

          {/* Equity Curve */}
          {result && equityData.length > 0 && (
            <div className="card p-4">
              <h3 className="label mb-3">Equity Curve</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(v) => [formatCurrency(Number(v)), 'Equity']}
                    contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#448aff"
                    fill="rgba(68,138,255,0.13)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Metrics */}
          {result?.metrics && (
            <div className="card p-4">
              <h3 className="label mb-3">Performance Metrics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Return', value: formatPct(result.metrics.total_return_pct) },
                  { label: 'Sharpe', value: result.metrics.sharpe_ratio?.toFixed(2) },
                  { label: 'Max Drawdown', value: formatPct(result.metrics.max_drawdown_pct) },
                  { label: 'Win Rate', value: formatPct(result.metrics.win_rate) },
                  { label: 'Total Trades', value: String(result.metrics.total_trades) },
                  { label: 'Profit Factor', value: result.metrics.profit_factor?.toFixed(2) },
                  { label: 'Sortino', value: result.metrics.sortino_ratio?.toFixed(2) },
                  { label: 'CAGR', value: formatPct(result.metrics.cagr ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-txt-secondary">{label}</p>
                    <p className="text-lg font-semibold">{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: DSL Reference */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="label mb-3">DSL Reference</h3>
            <div className="space-y-2">
              {DSL_HELP.map(({ keyword, desc }) => (
                <div key={keyword} className="flex gap-2 text-xs">
                  <code className="text-accent-blue font-mono shrink-0">{keyword}</code>
                  <span className="text-txt-secondary">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="label mb-3">Available Columns</h3>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_COLUMNS.map(col => (
                <button
                  key={col}
                  className="px-2 py-0.5 bg-bg-secondary rounded text-xs font-mono text-txt-secondary hover:text-accent-blue cursor-pointer"
                  onClick={() => setRules(prev => prev + ' ' + col)}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="label mb-3">Example</h3>
            <pre className="text-xs font-mono text-txt-secondary whitespace-pre-wrap">{EXAMPLE_RULES}</pre>
            <button
              className="text-xs text-accent-blue mt-2 hover:underline"
              onClick={() => setRules(EXAMPLE_RULES)}
            >
              Load example
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
