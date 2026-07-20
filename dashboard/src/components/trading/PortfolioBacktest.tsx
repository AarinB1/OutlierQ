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
import { runPortfolioBacktest } from '../../api'
import { useToast } from '../../hooks/useToast'
import type { PortfolioBacktestResult } from '../../types'

const formatCurrency = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatPct = (v: number, digits = 1) => `${v.toFixed(digits)}%`


export default function PortfolioBacktest() {
  const { addToast } = useToast()
  const [tickersInput, setTickersInput] = useState('AAPL, MSFT, GOOGL, AMZN, META')
  const [strategy, setStrategy] = useState('momentum')
  const [period, setPeriod] = useState('1y')
  const [capital, setCapital] = useState(100000)
  const [maxPositions, setMaxPositions] = useState(10)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null)

  const handleRun = async () => {
    const tickers = tickersInput.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    if (tickers.length === 0) return
    setLoading(true)
    try {
      const data = await runPortfolioBacktest({
        tickers,
        strategy,
        period,
        initial_capital: capital,
        max_positions: maxPositions,
      })
      setResult(data)
      addToast('success', `Portfolio backtest complete (${tickers.length} tickers)`)
    } catch (e: unknown) {
      addToast('error', e instanceof Error ? e.message : 'Portfolio backtest failed')
    } finally {
      setLoading(false)
    }
  }

  const equityData = result?.equity_curve
    ? result.equity_curve.dates.map((d, i) => ({
        date: d.slice(0, 10),
        portfolio: result.equity_curve.values[i],
      }))
    : []

  const corrTickers = result?.correlation_matrix ? Object.keys(result.correlation_matrix) : []

  return (
    <div className="space-y-6">
      <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">Portfolio Backtest</h2>

      {/* Config */}
      <div className="card p-4">
        <div className="space-y-3">
          <div>
            <label className="label text-xs block mb-1">Tickers (comma-separated)</label>
            <input
              type="text"
              className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm"
              value={tickersInput}
              onChange={e => setTickersInput(e.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, GOOGL"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="label text-xs">Strategy</label>
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
            <div className="flex items-center gap-2">
              <label className="label text-xs">Max Positions</label>
              <input
                type="number"
                className="w-16 bg-bg-secondary border border-border rounded px-2 py-1 text-sm"
                value={maxPositions}
                onChange={e => setMaxPositions(Number(e.target.value))}
                min={1}
                max={50}
              />
            </div>
            <button
              className="btn-primary px-4 py-1.5 text-sm ml-auto"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? 'Running...' : 'Run Portfolio Backtest'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <>
          {/* Portfolio Metrics */}
          <div className="card p-4">
            <h3 className="label mb-3">Portfolio Metrics</h3>
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

          {/* Portfolio Equity Curve */}
          {equityData.length > 0 && (
            <div className="card p-4">
              <h3 className="label mb-3">Portfolio Equity Curve</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => [formatCurrency(Number(v)), 'Portfolio']}
                    contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                  <Area type="monotone" dataKey="portfolio" stroke="#448aff" fill="rgba(68,138,255,0.13)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-ticker Metrics Table */}
          {Object.keys(result.per_ticker_metrics).length > 0 && (
            <div className="card p-4 overflow-x-auto">
              <h3 className="label mb-3">Per-Ticker Metrics</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-txt-secondary text-xs border-b border-border">
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-right py-2 px-3">Return</th>
                    <th className="text-right py-2 px-3">Sharpe</th>
                    <th className="text-right py-2 px-3">MDD</th>
                    <th className="text-right py-2 px-3">Win Rate</th>
                    <th className="text-right py-2 px-3">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.per_ticker_metrics).map(([t, m]) => (
                    <tr key={t} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono font-semibold">{t}</td>
                      <td className="text-right py-2 px-3">{formatPct(m.total_return_pct)}</td>
                      <td className="text-right py-2 px-3">{m.sharpe_ratio?.toFixed(2)}</td>
                      <td className="text-right py-2 px-3">{formatPct(m.max_drawdown_pct)}</td>
                      <td className="text-right py-2 px-3">{formatPct(m.win_rate)}</td>
                      <td className="text-right py-2 px-3">{m.total_trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Correlation Matrix */}
          {corrTickers.length > 1 && (
            <div className="card p-4 overflow-x-auto">
              <h3 className="label mb-3">Correlation Matrix</h3>
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="py-1 px-2" />
                    {corrTickers.map(t => (
                      <th key={t} className="py-1 px-2 font-mono">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrTickers.map(t1 => (
                    <tr key={t1}>
                      <td className="py-1 px-2 font-mono font-semibold">{t1}</td>
                      {corrTickers.map(t2 => {
                        const val = result.correlation_matrix[t1]?.[t2] ?? 0
                        const abs = Math.abs(val)
                        const bg = abs > 0.7 ? 'bg-accent-red/20' : abs > 0.4 ? 'bg-accent-yellow/20' : 'bg-accent-green/20'
                        return (
                          <td key={t2} className={`py-1 px-2 text-center ${bg} rounded`}>
                            {val.toFixed(2)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
