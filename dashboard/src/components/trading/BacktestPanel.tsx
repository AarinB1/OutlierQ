import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compareBacktests, fetchBacktestList, runBacktest } from '../../api'
import type {
  BacktestCompareResult,
  BacktestFullResult,
  BacktestSummary,
  BacktestTrade,
} from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

type SortDir = 'asc' | 'desc'

const BENCHMARK_OPTIONS = ['SPY', 'QQQ', 'IWM', 'DIA'] as const
const COMPARABLE_STRATEGIES = ['momentum', 'mean_reversion', 'breakout'] as const

/** Distinct series colours for the comparison overlay. */
const STRATEGY_COLORS: Record<string, string> = {
  momentum: '#00d68f',
  mean_reversion: '#448aff',
  breakout: '#ffab00',
}

/**
 * Rows of the comparison table. `good` marks which direction is better so the
 * best/worst cell in each row can be highlighted.
 */
const COMPARE_ROWS: { key: string; label: string; good: 'high' | 'low' | null; suffix?: string }[] = [
  { key: 'total_return_pct', label: 'Return %', good: 'high', suffix: '%' },
  { key: 'sharpe_ratio', label: 'Sharpe', good: 'high' },
  { key: 'sortino_ratio', label: 'Sortino', good: 'high' },
  { key: 'max_drawdown_pct', label: 'Max DD %', good: 'low', suffix: '%' },
  { key: 'win_rate', label: 'Win Rate %', good: 'high', suffix: '%' },
  { key: 'profit_factor', label: 'Profit Factor', good: 'high' },
  { key: 'total_trades', label: 'Trades', good: null },
]

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
  const { addToast } = useToast()
  const [strategy, setStrategy] = useState('momentum')
  const [capital, setCapital] = useState(100000)
  const [ticker, setTicker] = useState('SPY')
  const [benchmark, setBenchmark] = useState<string>('SPY')
  const [compareMode, setCompareMode] = useState(false)
  const [strategiesCompare, setStrategiesCompare] = useState<string[]>([...COMPARABLE_STRATEGIES])
  const [result, setResult] = useState<BacktestFullResult | null>(null)
  const [compareResult, setCompareResult] = useState<BacktestCompareResult | null>(null)
  const [previousRuns, setPreviousRuns] = useState<BacktestSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPrevious, setShowPrevious] = useState(false)
  const [pnlSortDir, setPnlSortDir] = useState<SortDir>('desc')

  const toggleCompareStrategy = (s: string) => {
    setStrategiesCompare((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const onRun = async () => {
    setLoading(true)
    setError(null)
    if (compareMode) {
      addToast('info', 'Comparison started', `Running ${strategiesCompare.length} strategies on ${ticker}...`)
      try {
        const res = await compareBacktests({
          strategies: strategiesCompare,
          ticker: ticker.toUpperCase(),
          period: '1y',
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
      return
    }
    addToast('info', 'Backtest started', `Running ${strategy} on ${ticker}...`)
    try {
      const res = await runBacktest({
        strategy,
        initial_capital: capital,
        ticker: ticker.toUpperCase(),
        period: '1y',
        benchmark: benchmark || undefined,
      })
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

  useEffect(() => {
    fetchBacktestList()
      .then(setPreviousRuns)
      .catch(() => {
        /* best-effort */
      })
  }, [])

  const equityData = useMemo(() => {
    if (!result) return []
    // Benchmark dates are aligned to the strategy's index server-side, but look
    // them up by date rather than by position so a gap cannot shift the overlay.
    const benchIndex = new Map(
      (result.benchmark_curve?.dates ?? []).map((d, i) => [d, result.benchmark_curve!.values[i]]),
    )
    return result.equity_curve.dates.map((d, i) => ({
      date: d,
      value: result.equity_curve.values[i] ?? null,
      benchmark: benchIndex.has(d) ? benchIndex.get(d) ?? null : null,
    }))
  }, [result])

  const compareEquityData = useMemo(() => {
    if (!compareResult?.results.length) return []
    const benchIndex = new Map(
      (compareResult.benchmark_curve?.dates ?? []).map((d, i) => [
        d,
        compareResult.benchmark_curve!.values[i],
      ]),
    )
    const perStrategy = compareResult.results.map((r) => ({
      strategy: r.strategy,
      byDate: new Map(r.equity_curve.dates.map((d, i) => [d, r.equity_curve.values[i]])),
    }))
    return compareResult.results[0].equity_curve.dates.map((d) => {
      const point: Record<string, string | number | null> = { date: d }
      for (const s of perStrategy) point[s.strategy] = s.byDate.get(d) ?? null
      point.benchmark = benchIndex.has(d) ? benchIndex.get(d) ?? null : null
      return point
    })
  }, [compareResult])

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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
                <option value="ensemble">Ensemble</option>
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <div className="label mb-1">Strategies to Compare</div>
              <div className="flex flex-wrap gap-3 pt-1.5">
                {COMPARABLE_STRATEGIES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
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
          <div className="flex flex-col justify-between">
            <div className="text-xs text-txt-tertiary mb-2">Uses 1 year of daily data</div>
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

      {/* Metrics Grid — single mode */}
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
            {/* The API already returns cagr in percent (metrics.py multiplies by 100). */}
            <MetricTile
              label="CAGR %"
              value={formatPct(result.metrics.cagr, 1)}
              className={metricColor(result.metrics.cagr)}
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
                label={`${result.benchmark_curve?.ticker ?? 'Benchmark'} Buy & Hold %`}
                value={formatPct(result.benchmark_return_pct, 1)}
                className="text-txt-secondary"
              />
            )}
          </div>
        </div>
      )}

      {/* Strategy Comparison — metrics table */}
      {!loading && compareResult && (
        <div className="card mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h3 className="font-mono font-semibold text-sm">Strategy Comparison</h3>
            <span className="text-xs text-txt-tertiary font-mono">
              {compareResult.ticker} · 1y daily
              {compareResult.benchmark_curve ? ` · vs ${compareResult.benchmark_curve.ticker} buy & hold` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
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
                {COMPARE_ROWS.map(({ key, label, good, suffix }) => {
                  const values = compareResult.results.map((r) => {
                    const raw = (r.metrics as unknown as Record<string, number>)[key]
                    if (raw == null || Number.isNaN(raw)) return null
                    return key === 'win_rate' ? raw * 100 : raw
                  })
                  const present = values.filter((v): v is number => v != null)
                  const bestValue = good == null || present.length === 0
                    ? null
                    : good === 'high' ? Math.max(...present) : Math.min(...present)
                  const worstValue = good == null || present.length < 2
                    ? null
                    : good === 'high' ? Math.min(...present) : Math.max(...present)
                  return (
                    <tr key={key} className="border-b border-border/40">
                      <td className="py-2 px-2 text-txt-tertiary">{label}</td>
                      {compareResult.results.map((r, i) => {
                        const v = values[i]
                        const cellClass = v == null
                          ? 'text-txt-tertiary'
                          : bestValue != null && v === bestValue
                            ? 'text-accent-green'
                            : worstValue != null && v === worstValue
                              ? 'text-accent-red'
                              : ''
                        return (
                          <td key={r.strategy} className={`py-2 px-2 font-mono ${cellClass}`}>
                            {v == null
                              ? '—'
                              : key === 'total_trades'
                                ? String(v)
                                : `${v.toFixed(2)}${suffix ?? ''}`}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-txt-tertiary mt-3">
            Same ticker, same window, same capital for every strategy. Trade counts differ
            because each strategy fires on its own conditions — compare risk-adjusted
            columns, not raw return alone.
          </p>
        </div>
      )}

      {/* Equity Curve — single mode, with benchmark overlay */}
      {result && !compareResult && (
        <div className="card mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <h3 className="font-mono font-semibold text-sm">Equity Curve</h3>
            {result.benchmark_curve && (
              <span className="text-xs text-txt-tertiary font-mono">
                dashed = {result.benchmark_curve.ticker} buy &amp; hold
              </span>
            )}
          </div>
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
                    stroke="#8888a0"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    dot={false}
                    name={`${result.benchmark_curve.ticker} Buy & Hold`}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Equity Curve — comparison overlay */}
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
                  tickFormatter={(v) => (typeof v === 'number' ? `$${(v / 1000).toFixed(0)}k` : '')}
                  stroke="#666"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#12121a',
                    border: '1px solid #333',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => (typeof v === 'number' ? formatCurrency(v) : String(v ?? ''))}
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
                    stroke={STRATEGY_COLORS[r.strategy] ?? '#8888a0'}
                    strokeWidth={2}
                    dot={false}
                    name={r.strategy.replace('_', ' ')}
                  />
                ))}
                {compareResult.benchmark_curve && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="#8888a0"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
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
      {result && !compareResult && (
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
      {result && !compareResult && (
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
      {result && !compareResult && (
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
