import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchBacktestList, runBacktest } from '../api'
import type { BacktestFullResult, BacktestSummary, BacktestTrade } from '../types'

type SortDir = 'asc' | 'desc'

const formatCurrency = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${v.toFixed(digits)}%`

const metricColor = (value: number | null | undefined, goodIsHigh = true): string => {
  if (value == null || Number.isNaN(value)) return 'text-txt-primary'
  const v = value
  if (goodIsHigh) {
    if (v > 0) return 'text-accent-green'
    if (v < 0) return 'text-accent-red'
  } else {
    if (v < 0) return 'text-accent-green'
    if (v > 0) return 'text-accent-red'
  }
  return 'text-txt-primary'
}

const tradePnlSorter = (dir: SortDir) => (a: BacktestTrade, b: BacktestTrade) => {
  const av = a.pnl_dollars ?? 0
  const bv = b.pnl_dollars ?? 0
  return dir === 'asc' ? av - bv : bv - av
}

export default function BacktestPanel() {
  const [strategy, setStrategy] = useState('momentum')
  const [capital, setCapital] = useState(100000)
  const [ticker, setTicker] = useState('SPY')
  const [result, setResult] = useState<BacktestFullResult | null>(null)
  const [previousRuns, setPreviousRuns] = useState<BacktestSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPrevious, setShowPrevious] = useState(false)
  const [pnlSortDir, setPnlSortDir] = useState<SortDir>('desc')

  const onRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await runBacktest({
        strategy,
        initial_capital: capital,
        ticker: ticker.toUpperCase(),
        period: '1y',
      })
      setResult(res)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to run backtest'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBacktestList()
      .then(setPreviousRuns)
      .catch(() => {
        /* best-effort */
      })
  }, [])

  const equityData = useMemo(
    () =>
      result
        ? result.equity_curve.dates.map((d, i) => ({
            date: d,
            value: result.equity_curve.values[i] ?? null,
          }))
        : [],
    [result],
  )

  const drawdownData = useMemo(
    () =>
      result
        ? result.drawdown_curve.dates.map((d, i) => ({
            date: d,
            value: result.drawdown_curve.values[i] ?? null,
          }))
        : [],
    [result],
  )

  const monthlyByYear = useMemo(() => {
    if (!result) return {}
    const grouped: Record<string, { month: number; label: string; value: number }[]> = {}
    for (const m of result.monthly_returns) {
      const [y, mm] = m.month.split('-')
      const monthIdx = Number(mm) - 1
      if (!grouped[y]) grouped[y] = []
      grouped[y].push({ month: monthIdx, label: m.month, value: m.return_pct })
    }
    Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.month - b.month))
    return grouped
  }, [result])

  const sortedTrades = useMemo(() => {
    if (!result) return []
    const trades = [...result.trades]
    trades.sort(tradePnlSorter(pnlSortDir))
    return trades.slice(0, 100)
  }, [result, pnlSortDir])

  const monthlyCellColor = (ret: number | null | undefined): string => {
    if (ret == null || Number.isNaN(ret)) return 'rgba(120,120,130,0.4)'
    if (ret > 5) return 'rgba(0,214,143,1)'
    if (ret > 2) return 'rgba(0,214,143,0.6)'
    if (ret > 0) return 'rgba(0,214,143,0.3)'
    if (ret > -2) return 'rgba(255,61,90,0.3)'
    if (ret > -5) return 'rgba(255,61,90,0.6)'
    return 'rgba(255,61,90,1)'
  }

  const renderEmptyState = () => (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-2xl text-txt-secondary">◇</div>
      <div className="font-mono font-semibold mb-1">No backtest results yet</div>
      <div className="text-sm text-txt-tertiary max-w-md">
        Select a strategy, ticker, and capital, then click Run Backtest to see performance analysis.
      </div>
    </div>
  )

  const renderMetricsSkeleton = () => (
    <div className="card grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div key={idx} className="space-y-2">
          <div className="skeleton h-3 w-16" />
          <div className="skeleton h-5 w-20" />
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Backtest Lab</h2>

      {/* Config Bar */}
      <div className="card mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <div className="label mb-1">Strategy</div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
          >
            <option value="momentum">Momentum</option>
            <option value="mean_reversion">Mean Reversion</option>
            <option value="breakout">Breakout</option>
            <option value="ensemble">Ensemble</option>
          </select>
        </div>
        <div>
          <div className="label mb-1">Ticker</div>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            placeholder="SPY"
          />
        </div>
        <div>
          <div className="label mb-1">Initial Capital</div>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
          />
        </div>
        <div className="flex flex-col justify-between">
          <div className="text-xs text-txt-tertiary mb-2">Uses 1 year of daily data</div>
          <button className="btn-primary w-full" onClick={onRun} disabled={loading}>
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {error && <div className="card mb-3 text-accent-red text-sm">{error}</div>}

      {!result && !loading && renderEmptyState()}

      {/* Metrics Grid */}
      {loading && renderMetricsSkeleton()}
      {!loading && result && (
        <div className="card mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
            <MetricTile
              label="Total Return %"
              value={formatPct(result.metrics.total_return_pct, 1)}
              className={metricColor(result.metrics.total_return_pct)}
            />
            <MetricTile
              label="Sharpe Ratio"
              value={result.metrics.sharpe_ratio.toFixed(2)}
              className={metricColor(result.metrics.sharpe_ratio)}
            />
            <MetricTile
              label="Sortino Ratio"
              value={result.metrics.sortino_ratio.toFixed(2)}
              className={metricColor(result.metrics.sortino_ratio)}
            />
            <MetricTile
              label="Max Drawdown %"
              value={formatPct(result.metrics.max_drawdown_pct, 1)}
              className={metricColor(-result.metrics.max_drawdown_pct, false)}
            />
            <MetricTile
              label="Win Rate %"
              value={formatPct(result.metrics.win_rate * 100, 1)}
              className={metricColor(result.metrics.win_rate * 100)}
            />
            <MetricTile
              label="Profit Factor"
              value={result.metrics.profit_factor.toFixed(2)}
              className={metricColor(result.metrics.profit_factor)}
            />
            <MetricTile
              label="Total Trades"
              value={String(result.metrics.total_trades)}
              className="text-txt-primary"
            />
            <MetricTile
              label="CAGR %"
              value={formatPct(result.metrics.cagr * 100, 1)}
              className={metricColor(result.metrics.cagr * 100)}
            />
            <MetricTile
              label="Calmar Ratio"
              value={result.metrics.calmar_ratio.toFixed(2)}
              className={metricColor(result.metrics.calmar_ratio)}
            />
            <MetricTile
              label="Expectancy"
              value={result.metrics.expectancy.toFixed(2)}
              className={metricColor(result.metrics.expectancy)}
            />
            <MetricTile
              label="Avg Holding Days"
              value={result.metrics.avg_holding_period_days.toFixed(1)}
              className="text-txt-primary"
            />
            <MetricTile
              label="Best Trade %"
              value={formatPct(result.metrics.best_trade_pnl, 1)}
              className={metricColor(result.metrics.best_trade_pnl)}
            />
          </div>
        </div>
      )}

      {/* Equity Curve */}
      {result && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-2">Equity Curve</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d68f" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00d68f" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short' })}
                  stroke="#666"
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={(v) =>
                    typeof v === 'number' ? `$${(v / 1000).toFixed(0)}k` : ''
                  }
                  stroke="#666"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? formatCurrency(v) : v
                  }
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#00d68f"
                  fill="url(#equityFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Drawdown Curve */}
      {result && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-2">Drawdown</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff3d5a" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ff3d5a" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short' })}
                  stroke="#666"
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={(v) =>
                    typeof v === 'number' ? `${v.toFixed(0)}%` : ''
                  }
                  stroke="#666"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? `${v.toFixed(1)}%` : v
                  }
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#ff3d5a"
                  fill="url(#ddFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monthly Returns Heatmap */}
      {result && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-3">Monthly Returns</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-13 gap-1 text-xs mb-1">
                <div />
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m) => (
                  <div key={m} className="text-center text-txt-tertiary">{m}</div>
                ))}
              </div>
              <div className="space-y-1">
                {Object.entries(monthlyByYear).map(([year, months]) => (
                  <div key={year} className="grid grid-cols-13 gap-1 items-center">
                    <div className="text-xs text-txt-tertiary pr-2">{year}</div>
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const entry = months.find((m) => m.month === idx)
                      const v = entry?.value
                      return (
                        <div
                          key={idx}
                          className="w-16 h-10 rounded flex items-center justify-center text-xs font-mono"
                          style={{ backgroundColor: v == null ? 'rgba(60,60,70,0.6)' : monthlyCellColor(v) }}
                        >
                          {v != null ? `${v.toFixed(1)}%` : '—'}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade Log */}
      {result && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono font-semibold text-sm">Trade Log</h3>
            <button
              className="text-xs text-txt-tertiary hover:text-accent-blue"
              onClick={() => setPnlSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              Sort P&amp;L {pnlSortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          {sortedTrades.length === 0 ? (
            <div className="text-sm text-txt-tertiary">No trades executed.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto text-xs">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 bg-surface-primary z-10">
                  <tr className="text-left text-txt-tertiary">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Ticker</th>
                    <th className="py-2 px-2">Direction</th>
                    <th className="py-2 px-2">Entry</th>
                    <th className="py-2 px-2">Exit</th>
                    <th className="py-2 px-2">P&amp;L $</th>
                    <th className="py-2 px-2">P&amp;L %</th>
                    <th className="py-2 px-2">Days</th>
                    <th className="py-2 px-2">Exit Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrades.map((t, idx) => {
                    const rowBg = idx % 2 === 0 ? 'bg-surface-secondary' : 'bg-surface-tertiary'
                    const pnlColor =
                      (t.pnl_dollars ?? 0) > 0
                        ? 'text-accent-green'
                        : (t.pnl_dollars ?? 0) < 0
                        ? 'text-accent-red'
                        : 'text-txt-primary'
                    const pnlPctColor =
                      (t.pnl_pct ?? 0) > 0
                        ? 'text-accent-green'
                        : (t.pnl_pct ?? 0) < 0
                        ? 'text-accent-red'
                        : 'text-txt-primary'
                    return (
                      <tr key={t.trade_id ?? idx} className={`${rowBg} text-xs`}>
                        <td className="py-2 px-2">{idx + 1}</td>
                        <td className="py-2 px-2 font-mono">{t.ticker}</td>
                        <td className="py-2 px-2">
                          <span
                            className={`pill text-xs ${
                              t.direction === 'BUY'
                                ? 'bg-accent-green-muted text-accent-green'
                                : 'bg-accent-red-muted text-accent-red'
                            }`}
                          >
                            {t.direction}
                          </span>
                        </td>
                        <td className="py-2 px-2">{t.entry_price.toFixed(2)}</td>
                        <td className="py-2 px-2">{t.exit_price.toFixed(2)}</td>
                        <td className={`py-2 px-2 font-mono ${pnlColor}`}>
                          {t.pnl_dollars.toFixed(2)}
                        </td>
                        <td className={`py-2 px-2 font-mono ${pnlPctColor}`}>
                          {t.pnl_pct.toFixed(2)}%
                        </td>
                        <td className="py-2 px-2">{t.holding_days}</td>
                        <td className="py-2 px-2 text-txt-tertiary">{t.exit_reason}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Previous Runs */}
      <div className="card">
        <button
          className="w-full text-left flex justify-between items-center text-sm text-txt-secondary"
          onClick={() => setShowPrevious((v) => !v)}
        >
          <span className="font-mono font-semibold">Previous Runs</span>
          <span>{showPrevious ? '−' : '+'}</span>
        </button>
        {showPrevious && (
          <div className="mt-3 text-xs overflow-x-auto">
            {previousRuns.length === 0 ? (
              <div className="text-txt-tertiary">No previous runs found.</div>
            ) : (
              <table className="w-full min-w-[480px]">
                <thead className="text-txt-tertiary">
                  <tr>
                    <th className="py-1 px-2 text-left">Strategy</th>
                    <th className="py-1 px-2 text-left">Ticker</th>
                    <th className="py-1 px-2 text-right">Return %</th>
                    <th className="py-1 px-2 text-right">Sharpe</th>
                    <th className="py-1 px-2 text-right">Trades</th>
                    <th className="py-1 px-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {previousRuns.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="py-1 px-2">{r.strategy_name}</td>
                      <td className="py-1 px-2 font-mono">{r.ticker}</td>
                      <td className="py-1 px-2 text-right">
                        {formatPct(r.total_return_pct, 1)}
                      </td>
                      <td className="py-1 px-2 text-right">
                        {r.sharpe != null ? r.sharpe.toFixed(2) : '—'}
                      </td>
                      <td className="py-1 px-2 text-right">{r.total_trades}</td>
                      <td className="py-1 px-2 text-right text-txt-tertiary">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface MetricTileProps {
  label: string
  value: string
  className?: string
}

function MetricTile({ label, value, className }: MetricTileProps) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-lg ${className ?? 'text-txt-primary'}`}>{value}</div>
    </div>
  )
}

