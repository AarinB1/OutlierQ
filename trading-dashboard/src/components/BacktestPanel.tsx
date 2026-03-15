import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { BacktestResult, BacktestSummary } from '../types'
import { api } from '../api'

const STRATEGIES = ['momentum', 'mean_reversion', 'breakout']

export default function BacktestPanel() {
  const [ticker, setTicker] = useState('SPY')
  const [strategy, setStrategy] = useState('momentum')
  const [period, setPeriod] = useState('1y')
  const [capital, setCapital] = useState(100000)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const runBacktest = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await api.runBacktest({
        ticker: ticker.toUpperCase(),
        strategy,
        period,
        initial_capital: capital,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed')
    } finally {
      setRunning(false)
    }
  }

  const equityData = result?.equity_curve
    ? result.equity_curve.dates.map((d, i) => ({
        date: d.split(' ')[0],
        value: result.equity_curve.values[i],
      }))
    : []

  return (
    <div>
      <h2 className="text-2xl font-bold font-sans mb-6">Backtest Lab</h2>

      {/* Config form */}
      <div className="card mb-6">
        <div className="grid grid-cols-5 gap-4 items-end">
          <div>
            <label className="label block mb-1">Ticker</label>
            <input
              className="w-full bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary focus:outline-none focus:border-accent-blue"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
          </div>
          <div>
            <label className="label block mb-1">Strategy</label>
            <select
              className="w-full bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary focus:outline-none focus:border-accent-blue"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Period</label>
            <select
              className="w-full bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary focus:outline-none focus:border-accent-blue"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="6mo">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="2y">2 Years</option>
              <option value="5y">5 Years</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Capital</label>
            <input
              type="number"
              className="w-full bg-surface-tertiary border border-border rounded-lg px-3 py-2 font-mono text-sm text-txt-primary focus:outline-none focus:border-accent-blue"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
            />
          </div>
          <button className="btn-primary" onClick={runBacktest} disabled={running}>
            {running ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
        {error && <p className="text-accent-red text-sm mt-2 font-mono">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Metrics grid */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <MetricCard label="Sharpe" value={result.metrics.sharpe_ratio.toFixed(2)} />
            <MetricCard label="Sortino" value={result.metrics.sortino_ratio.toFixed(2)} />
            <MetricCard label="Return" value={`${result.metrics.total_return_pct.toFixed(1)}%`} color={result.metrics.total_return_pct >= 0 ? 'green' : 'red'} />
            <MetricCard label="Max DD" value={`${result.metrics.max_drawdown_pct.toFixed(1)}%`} color="red" />
            <MetricCard label="Win Rate" value={`${(result.metrics.win_rate * 100).toFixed(0)}%`} />
            <MetricCard label="Trades" value={result.metrics.total_trades.toString()} />
          </div>

          {/* Equity curve */}
          <div className="card mb-6">
            <h3 className="text-lg font-bold mb-4">Equity Curve</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={equityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#8888a0', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#8888a0', fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#8888a0' }}
                />
                <Line type="monotone" dataKey="value" stroke="#448aff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Trade table */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">Trade Log ({result.trades.length})</h3>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm font-mono">
                <thead className="text-txt-tertiary text-xs uppercase sticky top-0 bg-surface-secondary">
                  <tr>
                    <th className="text-left py-2 px-2">Direction</th>
                    <th className="text-right py-2 px-2">Entry</th>
                    <th className="text-right py-2 px-2">Exit</th>
                    <th className="text-right py-2 px-2">P&L %</th>
                    <th className="text-right py-2 px-2">P&L $</th>
                    <th className="text-left py-2 px-2">Exit Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(0, 50).map((t, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className={`py-1.5 px-2 ${t.direction === 'BUY' ? 'text-accent-green' : 'text-accent-red'}`}>{t.direction}</td>
                      <td className="text-right py-1.5 px-2">{Number(t.entry_price).toFixed(2)}</td>
                      <td className="text-right py-1.5 px-2">{Number(t.exit_price).toFixed(2)}</td>
                      <td className={`text-right py-1.5 px-2 ${Number(t.pnl_pct) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {Number(t.pnl_pct).toFixed(2)}%
                      </td>
                      <td className={`text-right py-1.5 px-2 ${Number(t.pnl_dollars) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        ${Number(t.pnl_dollars).toFixed(0)}
                      </td>
                      <td className="py-1.5 px-2 text-txt-tertiary">{t.exit_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = color === 'green' ? 'text-accent-green' : color === 'red' ? 'text-accent-red' : 'text-txt-primary'
  return (
    <div className="card text-center">
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-xl ${c}`}>{value}</div>
    </div>
  )
}
