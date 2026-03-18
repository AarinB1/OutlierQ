import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  compareBacktests,
  exportBacktest,
  fetchBacktestList,
  runBacktest,
} from '../api'
import type { BacktestFullResult, BacktestSummary, BacktestTrade } from '../types'
import { useToast } from '../hooks/useToast'
import EmptyState from './EmptyState'

const BENCHMARK_OPTIONS = ['SPY', 'QQQ', 'IWM', 'DIA']

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

type CompareResult = Awaited<ReturnType<typeof compareBacktests>>

function defaultStartDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BacktestPanel() {
  const { addToast } = useToast()
  const [strategy, setStrategy] = useState('momentum')
  const [strategiesCompare, setStrategiesCompare] = useState<string[]>(['momentum', 'mean_reversion', 'breakout'])
  const [compareMode, setCompareMode] = useState(false)
  const [capital, setCapital] = useState(100000)
  const [ticker, setTicker] = useState('SPY')
  const [startDate, setStartDate] = useState(defaultStartDate())
  const [endDate, setEndDate] = useState(defaultEndDate())
  const [benchmark, setBenchmark] = useState('SPY')
  const [result, setResult] = useState<BacktestFullResult | null>(null)
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [previousRuns, setPreviousRuns] = useState<BacktestSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPrevious, setShowPrevious] = useState(false)
  const [pnlSortDir, setPnlSortDir] = useState<SortDir>('desc')

  const backtestPayload = useMemo(
    () => ({
      strategy,
      initial_capital: capital,
      ticker: ticker.toUpperCase(),
      start_date: startDate,
      end_date: endDate,
      benchmark: benchmark || undefined,
    }),
    [strategy, capital, ticker, startDate, endDate, benchmark],
  )

  const onRun = async () => {
    setLoading(true)
    setError(null)
    setCompareResult(null)
    if (compareMode) {
      addToast('info', 'Comparison started', `Running ${strategiesCompare.length} strategies on ${ticker}...`)
      try {
        const res = await compareBacktests({
          strategies: strategiesCompare,
          ticker: ticker.toUpperCase(),
          start_date: startDate,
          end_date: endDate,
          initial_capital: capital,
          benchmark: benchmark || undefined,
        })
        setCompareResult(res)
        setResult(null)
        addToast('trade', 'Comparison complete', `${res.results.length} strategies compared`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to run comparison'
        setError(msg)
        addToast('error', 'Comparison failed', msg)
      } finally {
        setLoading(false)
      }
    } else {
      addToast('info', 'Backtest started', `Running ${strategy} on ${ticker}...`)
      try {
        const res = await runBacktest(backtestPayload)
        setResult(res)
        setCompareResult(null)
        addToast(
          'trade',
          'Backtest complete',
          `${res.metrics.total_trades} trades • Sharpe ${res.metrics.sharpe_ratio.toFixed(
            2,
          )} • Return ${res.metrics.total_return_pct.toFixed(1)}%`,
        )
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to run backtest'
        setError(msg)
        addToast('error', 'Backtest failed', msg)
      } finally {
        setLoading(false)
      }
    }
  }

  const onExport = async (format: 'csv' | 'json') => {
    if (!result?.id) return
    try {
      const blob = await exportBacktest(result.id, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backtest_${result.id}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      addToast('info', 'Export complete', `Downloaded backtest.${format}`)
    } catch (e) {
      addToast('error', 'Export failed', e instanceof Error ? e.message : 'Export failed')
    }
  }

  const toggleCompareStrategy = (s: string) => {
    setStrategiesCompare((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  useEffect(() => {
    fetchBacktestList()
      .then(setPreviousRuns)
      .catch(() => {
        /* best-effort */
      })
  }, [])

  const equityData = useMemo(() => {
    if (result) {
      return result.equity_curve.dates.map((d, i) => {
        const point: Record<string, unknown> = {
          date: d,
          value: result.equity_curve.values[i] ?? null,
        }
        if (result.benchmark_curve) {
          const bi = result.benchmark_curve.dates.indexOf(d)
          point.benchmark = bi >= 0 ? result.benchmark_curve.values[bi] : null
        }
        return point
      })
    }
    return []
  }, [result])

  const compareEquityData = useMemo(() => {
    if (!compareResult?.results.length) return []
    const dates = compareResult.results[0].equity_curve.dates
    return dates.map((d) => {
      const point: Record<string, number | string | null> = { date: d }
      for (const r of compareResult.results) {
        const idx = r.equity_curve.dates.indexOf(d)
        point[r.strategy] = idx >= 0 ? r.equity_curve.values[idx] : null
      }
      if (compareResult.benchmark_curve) {
        const bi = compareResult.benchmark_curve.dates.indexOf(d)
        point.benchmark = bi >= 0 ? compareResult.benchmark_curve.values[bi] : null
      }
      return point
    })
  }, [compareResult])

  const STRATEGY_COLORS: Record<string, string> = {
    momentum: '#00d68f',
    mean_reversion: '#4dc9f6',
    breakout: '#f67019',
  }

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
    <div className="card">
      <EmptyState
        icon="▶"
        title="No backtest results yet"
        subtitle="Select a strategy and click Run Backtest to see historical performance analysis with equity curves, drawdown charts, and trade logs."
      />
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
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            className={`text-sm px-3 py-1 rounded ${!compareMode ? 'bg-accent-green/20 text-accent-green' : 'bg-surface-tertiary text-txt-secondary'}`}
            onClick={() => setCompareMode(false)}
          >
            Single
          </button>
          <button
            className={`text-sm px-3 py-1 rounded ${compareMode ? 'bg-accent-green/20 text-accent-green' : 'bg-surface-tertiary text-txt-secondary'}`}
            onClick={() => setCompareMode(true)}
          >
            Compare
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {!compareMode ? (
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
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <div className="label mb-1">Strategies to Compare</div>
              <div className="flex flex-wrap gap-2">
                {['momentum', 'mean_reversion', 'breakout'].map((s) => (
                  <label key={s} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={strategiesCompare.includes(s)}
                      onChange={() => toggleCompareStrategy(s)}
                    />
                    <span className="capitalize">{s.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
            <div className="label mb-1">Start Date</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            />
          </div>
          <div>
            <div className="label mb-1">End Date</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            />
          </div>
          <div>
            <div className="label mb-1">Benchmark</div>
            <select
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
            >
              {BENCHMARK_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
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
          <div className="flex flex-col justify-end">
            <button
              className="btn-primary w-full"
              onClick={onRun}
              disabled={loading || (compareMode && strategiesCompare.length === 0)}
            >
              {loading ? 'Running...' : compareMode ? 'Compare Strategies' : 'Run Backtest'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="card mb-3 text-accent-red text-sm">{error}</div>}

      {!result && !compareResult && !loading && renderEmptyState()}

      {/* Metrics Grid - Single Mode */}
      {loading && renderMetricsSkeleton()}
      {!loading && result && !compareResult && (
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
            {result.benchmark_return_pct != null && (
              <MetricTile
                label={`${result.benchmark_curve?.ticker ?? 'Benchmark'} Return %`}
                value={formatPct(result.benchmark_return_pct, 1)}
                className="text-txt-secondary"
              />
            )}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
            <button
              className="text-sm px-3 py-1 rounded bg-surface-tertiary hover:bg-surface-secondary"
              onClick={() => onExport('csv')}
            >
              Export CSV
            </button>
            <button
              className="text-sm px-3 py-1 rounded bg-surface-tertiary hover:bg-surface-secondary"
              onClick={() => onExport('json')}
            >
              Export JSON
            </button>
          </div>
        </div>
      )}

      {/* Compare Mode - Metrics Table */}
      {!loading && compareResult && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-3">Strategy Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-txt-tertiary border-b border-border">
                  <th className="py-2 px-2">Metric</th>
                  {compareResult.results.map((r) => (
                    <th key={r.strategy} className="py-2 px-2 capitalize">
                      {r.strategy.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'total_return_pct', label: 'Return %', good: 'high' },
                  { key: 'sharpe_ratio', label: 'Sharpe', good: 'high' },
                  { key: 'max_drawdown_pct', label: 'Max DD %', good: 'low' },
                  { key: 'win_rate', label: 'Win Rate %', good: 'high' },
                  { key: 'profit_factor', label: 'Profit Factor', good: 'high' },
                  { key: 'total_trades', label: 'Trades', good: null },
                ].map(({ key, label, good }) => {
                  const vals = compareResult.results.map((r) => {
                    const m = r.metrics as Record<string, number>
                    let v = m[key]
                    if (key === 'win_rate' && v != null) v = v * 100
                    return v
                  })
                  const validVals = vals.filter((x) => x != null && !Number.isNaN(x)) as number[]
                  const bestIdx = good === 'high' && validVals.length ? vals.indexOf(Math.max(...validVals)) : good === 'low' && validVals.length ? vals.indexOf(Math.min(...validVals)) : -1
                  const worstIdx = good === 'high' && validVals.length ? vals.indexOf(Math.min(...validVals)) : good === 'low' && validVals.length ? vals.indexOf(Math.max(...validVals)) : -1
                  return (
                    <tr key={key} className="border-b border-border/40">
                      <td className="py-2 px-2 text-txt-tertiary">{label}</td>
                      {compareResult.results.map((r, i) => {
                        const m = r.metrics as Record<string, number>
                        let v = m[key]
                        if (key === 'win_rate' && v != null) v = v * 100
                        const cellClass =
                          good && vals[i] != null
                            ? i === bestIdx
                              ? 'text-accent-green'
                              : i === worstIdx
                              ? 'text-accent-red'
                              : ''
                            : ''
                        return (
                          <td key={r.strategy} className={`py-2 px-2 font-mono ${cellClass}`}>
                            {v != null ? (typeof v === 'number' && key.includes('pct') ? `${v.toFixed(1)}%` : v.toFixed(2)) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Equity Curve - Single Mode */}
      {result && !compareResult && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-2">Equity Curve</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={equityData}>
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
                  formatter={(v) =>
                    typeof v === 'number' ? formatCurrency(v) : String(v ?? '')
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
                  name="Strategy"
                />
                {result.benchmark_curve && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#666"
                    strokeDasharray="5 5"
                    dot={false}
                    name={`${result.benchmark_curve.ticker} Buy & Hold`}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Equity Curve - Compare Mode */}
      {compareResult && (
        <div className="card mb-4">
          <h3 className="font-mono font-semibold text-sm mb-2">Equity Curve Comparison</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={compareEquityData}>
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
                  formatter={(v) =>
                    typeof v === 'number' ? formatCurrency(v) : String(v ?? '')
                  }
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                {compareResult.results.map((r) => (
                  <Line
                    key={r.strategy}
                    type="monotone"
                    dataKey={r.strategy}
                    stroke={STRATEGY_COLORS[r.strategy] ?? '#888'}
                    dot={false}
                    name={r.strategy.replace('_', ' ')}
                  />
                ))}
                {compareResult.benchmark_curve && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#666"
                    strokeDasharray="5 5"
                    dot={false}
                    name={`${compareResult.benchmark_curve.ticker} Buy & Hold`}
                  />
                )}
              </ComposedChart>
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
                  formatter={(v) =>
                    typeof v === 'number' ? `${v.toFixed(1)}%` : String(v ?? '')
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

