import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchExecutions, fetchPortfolio, fetchPortfolioHistory } from '../api'
import type { ClosedTrade, PortfolioHistoryPoint, PortfolioPosition, PortfolioSnapshot } from '../types'
import { useToast } from '../hooks/useToast'
import EmptyState from './EmptyState'

type Tab = 'open' | 'history'
type SortDir = 'asc' | 'desc'

const formatCurrency = (v: number | null | undefined, digits = 2) =>
  v == null ? '$0.00' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })

const formatPct = (v: number | null | undefined, digits = 2) =>
  v == null ? '0.00%' : `${v.toFixed(digits)}%`

export default function PortfolioView() {
  const { addToast } = useToast()

  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([])
  const [executions, setExecutions] = useState<ClosedTrade[]>([])

  const [snapshotLoading, setSnapshotLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [executionsLoading, setExecutionsLoading] = useState(true)

  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [executionsError, setExecutionsError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [pnlSortDir, setPnlSortDir] = useState<SortDir>('desc')
  const toastShownRef = useRef(false)

  useEffect(() => {
    const loadSnapshot = async () => {
      setSnapshotLoading(true)
      try {
        const res = await fetchPortfolio()
        setSnapshot(res)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load portfolio snapshot'
        setSnapshotError(msg)
        if (!toastShownRef.current) {
          addToast('error', 'Portfolio data error', 'Failed to load portfolio. Retrying...')
          toastShownRef.current = true
        }
      } finally {
        setSnapshotLoading(false)
      }
    }

    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const res = await fetchPortfolioHistory(30)
        setHistory(res)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load portfolio history'
        setHistoryError(msg)
        if (!toastShownRef.current) {
          addToast('error', 'Portfolio data error', 'Failed to load portfolio. Retrying...')
          toastShownRef.current = true
        }
      } finally {
        setHistoryLoading(false)
      }
    }

    const loadExecutions = async () => {
      setExecutionsLoading(true)
      try {
        const res = await fetchExecutions({ limit: 100 })
        setExecutions(res)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load executions'
        setExecutionsError(msg)
        if (!toastShownRef.current) {
          addToast('error', 'Portfolio data error', 'Failed to load portfolio. Retrying...')
          toastShownRef.current = true
        }
      } finally {
        setExecutionsLoading(false)
      }
    }

    loadSnapshot()
    loadHistory()
    loadExecutions()
  }, [addToast])

  const positions: PortfolioPosition[] = useMemo(
    () => (snapshot?.positions_json as PortfolioPosition[]) ?? [],
    [snapshot],
  )

  const totalValue = snapshot?.total_value ?? 100000
  const totalCash = snapshot?.cash ?? 100000
  const dailyPnl = snapshot?.daily_pnl ?? 0
  const cumulativePnl = snapshot?.cumulative_pnl ?? 0
  const maxDrawdown = snapshot?.max_drawdown ?? 0

  const openCount = positions.length

  const tradesSorted = useMemo(() => {
    const arr = [...executions]
    arr.sort((a, b) => {
      const av = a.pnl_dollars ?? 0
      const bv = b.pnl_dollars ?? 0
      return pnlSortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [executions, pnlSortDir])

  const allocation = useMemo(() => {
    if (!positions.length || !totalValue) return []
    return positions.map((p) => {
      const basePrice = p.current_price || p.entry_price
      const notional = p.quantity * basePrice
      const weight = totalValue > 0 ? (notional / totalValue) * 100 : 0
      return { ticker: p.ticker, weight }
    })
  }, [positions, totalValue])

  const allocationTotal = allocation.reduce((sum, a) => sum + a.weight, 0)

  const statColorForTotal = totalValue > 100000 ? 'text-accent-green' : totalValue < 100000 ? 'text-accent-red' : 'text-txt-primary'
  const colorForPnl = (v: number) =>
    v > 0 ? 'text-accent-green' : v < 0 ? 'text-accent-red' : 'text-txt-secondary'

  const historyChartData = history.map((p) => ({
    date: p.timestamp,
    total_value: p.total_value,
    daily_pnl: p.daily_pnl,
    cumulative_pnl: p.cumulative_pnl,
  }))

  const renderStatsSkeleton = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="card">
          <div className="skeleton h-3 w-20 mb-2" />
          <div className="skeleton h-6 w-24" />
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Portfolio</h2>

      {/* Summary Stats Row */}
      {snapshotLoading ? (
        renderStatsSkeleton()
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <div className="card">
            <div className="label mb-1">Total Value</div>
            <div className={`font-mono font-bold text-2xl ${statColorForTotal}`}>
              {formatCurrency(totalValue)}
            </div>
          </div>
          <div className="card">
            <div className="label mb-1">Cash</div>
            <div className="font-mono font-bold text-2xl text-txt-primary">
              {formatCurrency(totalCash)}
            </div>
          </div>
          <div className="card">
            <div className="label mb-1">Daily P&amp;L</div>
            <div className={`font-mono font-bold text-2xl flex items-center gap-1 ${colorForPnl(dailyPnl)}`}>
              <span aria-hidden="true">{dailyPnl > 0 ? '▲' : dailyPnl < 0 ? '▼' : '■'}</span>
              <span>{formatCurrency(dailyPnl)}</span>
            </div>
          </div>
          <div className="card">
            <div className="label mb-1">Cumulative P&amp;L</div>
            <div className={`font-mono font-bold text-2xl flex items-center gap-1 ${colorForPnl(cumulativePnl)}`}>
              <span aria-hidden="true">{cumulativePnl > 0 ? '▲' : cumulativePnl < 0 ? '▼' : '■'}</span>
              <span>{formatCurrency(cumulativePnl)}</span>
            </div>
          </div>
          <div className="card">
            <div className="label mb-1">Max Drawdown</div>
            <div
              className={`font-mono font-bold text-2xl ${
                maxDrawdown === 0 ? 'text-txt-secondary' : 'text-accent-red'
              }`}
            >
              {formatPct(maxDrawdown * 100)}
            </div>
          </div>
          <div className="card">
            <div className="label mb-1">Open Positions</div>
            <div className="font-mono font-bold text-2xl text-txt-primary">
              {openCount}
            </div>
          </div>
        </div>
      )}

      {snapshotError && (
        <div className="card mb-3 text-accent-red text-sm">{snapshotError}</div>
      )}

      {/* Equity Timeline */}
      <div className="card mb-4">
        <h3 className="font-mono font-semibold text-sm mb-2">Portfolio Value Over Time</h3>
        {historyLoading ? (
          <div className="h-[280px] skeleton rounded" />
        ) : historyChartData.length === 0 ? (
          <div className="text-sm text-txt-tertiary py-6">
            <p className="mb-2">
              No portfolio history yet. Portfolio snapshots are recorded when the paper trading
              bot runs.
            </p>
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyChartData}>
                <defs>
                  <linearGradient id="equityTimelineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#448aff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#448aff" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                  stroke="#666"
                  minTickGap={32}
                />
                <YAxis
                  dataKey="total_value"
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
                  formatter={(_, name, props) => {
                    const { payload } = props || {}
                    if (!payload) return ''
                    if (name === 'total_value') return formatCurrency(payload.total_value)
                    if (name === 'daily_pnl') return formatCurrency(payload.daily_pnl)
                    if (name === 'cumulative_pnl') return formatCurrency(payload.cumulative_pnl)
                    return ''
                  }}
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
                  dataKey="total_value"
                  stroke="#448aff"
                  fill="url(#equityTimelineFill)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {historyError && (
          <div className="mt-2 text-xs text-accent-red">{historyError}</div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-3">
        <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('open')}
            className={`px-3 py-1 rounded-md transition ${
              activeTab === 'open'
                ? 'bg-surface-tertiary text-txt-primary'
                : 'text-txt-secondary'
            }`}
          >
            Open Positions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1 rounded-md transition ${
              activeTab === 'history'
                ? 'bg-surface-tertiary text-txt-primary'
                : 'text-txt-secondary'
            }`}
          >
            Trade History
          </button>
        </div>
      </div>

      {/* Open Positions */}
      {activeTab === 'open' && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono font-semibold text-sm">Open Positions</h3>
            <span className="pill text-xs bg-surface-tertiary text-txt-secondary">
              {openCount} open
            </span>
          </div>
          {snapshotLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="skeleton h-8 w-full" />
              ))}
            </div>
          ) : positions.length === 0 ? (
            <EmptyState
              icon="◻"
              title="No open positions"
              subtitle="Generate signals and they will appear here when the paper trading bot executes them. Run --trading-scheduler to start the bot."
            />
          ) : (
            <>
              <div className="overflow-x-auto mb-3 text-xs">
                <table className="w-full min-w-[700px] border-separate border-spacing-0">
                  <thead className="text-txt-tertiary">
                    <tr>
                      <th className="py-2 px-2 text-left">Ticker</th>
                      <th className="py-2 px-2 text-left">Direction</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2 text-right">Entry Price</th>
                      <th className="py-2 px-2 text-right">Current Price</th>
                      <th className="py-2 px-2 text-right">Unrealized P&amp;L</th>
                      <th className="py-2 px-2 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, idx) => {
                      const basePrice = p.current_price || p.entry_price
                      const notional = p.quantity * basePrice
                      const weight = totalValue > 0 ? (notional / totalValue) * 100 : 0
                      const entry = p.entry_price
                      const current = basePrice
                      let pctMove = 0
                      if (entry) {
                        if (p.direction === 'SHORT') {
                          pctMove = ((entry - current) / entry) * 100
                        } else {
                          pctMove = ((current - entry) / entry) * 100
                        }
                      }
                      const unrealPnlDollars = p.unrealized_pnl ?? (notional - p.quantity * entry)
                      const pnlColor =
                        unrealPnlDollars > 0
                          ? 'text-accent-green'
                          : unrealPnlDollars < 0
                          ? 'text-accent-red'
                          : 'text-txt-primary'
                      const rowBg = idx % 2 === 0 ? 'bg-surface-secondary' : ''
                      return (
                        <tr key={p.ticker + idx} className={rowBg}>
                          <td className="py-2 px-2 font-mono font-bold">{p.ticker}</td>
                          <td className="py-2 px-2">
                            <span
                              className={`pill text-xs ${
                                p.direction === 'BUY'
                                  ? 'bg-accent-green-muted text-accent-green'
                                  : 'bg-accent-red-muted text-accent-red'
                              }`}
                            >
                              {p.direction}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right">{p.quantity}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {formatCurrency(entry, 2)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {formatCurrency(current, 2)}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${pnlColor}`}>
                            {`${formatCurrency(unrealPnlDollars, 2)} (${pctMove.toFixed(1)}%)`}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {weight.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Allocation bar */}
              {allocation.length > 0 && (
                <div className="mt-3">
                  <div className="h-3 rounded-full bg-surface-tertiary overflow-hidden flex">
                    {allocation.map((a, idx) => {
                      const palette = [
                        'bg-accent-blue',
                        'bg-accent-green',
                        'bg-accent-amber',
                        'bg-accent-red',
                      ]
                      const color = palette[idx % palette.length]
                      const widthPct =
                        allocationTotal > 0 ? (a.weight / allocationTotal) * 100 : 0
                      return (
                        <div
                          key={a.ticker}
                          className={color}
                          style={{ width: `${widthPct}%` }}
                          title={`${a.ticker} ${a.weight.toFixed(1)}%`}
                        />
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-txt-tertiary">
                    {allocation.map((a) => (
                      <span key={a.ticker} className="pill bg-surface-tertiary">
                        {a.ticker} {a.weight.toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Trade History */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-mono font-semibold text-sm">Trade History</h3>
            <button
              className="text-xs text-txt-tertiary hover:text-accent-blue"
              onClick={() => setPnlSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              Sort P&amp;L {pnlSortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          {executionsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="skeleton h-7 w-full" />
              ))}
            </div>
          ) : tradesSorted.length === 0 ? (
            <EmptyState
              icon="◻"
              title="No trades completed yet"
              subtitle="Closed positions will appear here with full P&L breakdown, exit reason, and strategy attribution."
            />
          ) : (
            <div className="max-h-[500px] overflow-y-auto text-xs">
              <table className="w-full min-w-[720px] border-separate border-spacing-0">
                <thead className="sticky top-0 bg-surface-primary z-10 text-txt-tertiary">
                  <tr>
                    <th className="py-2 px-2 text-left">Ticker</th>
                    <th className="py-2 px-2 text-left">Direction</th>
                    <th className="py-2 px-2 text-right">Entry</th>
                    <th className="py-2 px-2 text-right">Exit</th>
                    <th className="py-2 px-2 text-right">P&amp;L $</th>
                    <th className="py-2 px-2 text-right">P&amp;L %</th>
                    <th className="py-2 px-2 text-left">Strategy</th>
                    <th className="py-2 px-2 text-left">Exit Reason</th>
                    <th className="py-2 px-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {tradesSorted.map((t, idx) => {
                    const pnlColor =
                      (t.pnl_dollars ?? 0) > 0
                        ? 'text-accent-green'
                        : (t.pnl_dollars ?? 0) < 0
                        ? 'text-accent-red'
                        : 'text-txt-primary'
                    const pnlPctColor =
                      (t.pnl_percent ?? 0) > 0
                        ? 'text-accent-green'
                        : (t.pnl_percent ?? 0) < 0
                        ? 'text-accent-red'
                        : 'text-txt-primary'
                    const rowBg = idx % 2 === 0 ? 'bg-surface-secondary' : ''
                    return (
                      <tr key={t.id} className={rowBg}>
                        <td className="py-2 px-2 font-mono font-bold">{t.ticker}</td>
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
                        <td className="py-2 px-2 text-right font-mono">
                          {formatCurrency(t.entry_price, 2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatCurrency(t.exit_price, 2)}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${pnlColor}`}>
                          {formatCurrency(t.pnl_dollars, 2)}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${pnlPctColor}`}>
                          {formatPct(t.pnl_percent, 2)}
                        </td>
                        <td className="py-2 px-2 text-left text-txt-secondary">
                          {t.strategy_name}
                        </td>
                        <td className="py-2 px-2 text-left">
                          <span className="pill bg-surface-tertiary text-txt-secondary text-[11px]">
                            {t.exit_reason}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-txt-secondary">
                          {t.exit_time
                            ? new Date(t.exit_time).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {executionsError && (
            <div className="mt-2 text-xs text-accent-red">{executionsError}</div>
          )}
        </div>
      )}
    </div>
  )
}

