import { useEffect, useMemo, useState } from 'react'
import { fetchTradingSignals, generateTradingSignals, updateSignalStatus } from '../../api'
import type { TradingSignal } from '../../types'

type DirectionFilter = 'all' | 'BUY' | 'SHORT' | 'SELL'
type StatusFilter = 'all' | 'pending' | 'active' | 'closed'

const now = () => new Date().getTime()

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = now() - new Date(iso).getTime()
  const sec = Math.max(1, Math.floor(diffMs / 1000))
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day > 0) return `${day}d ago`
  if (hr > 0) return `${hr}h ago`
  if (min > 0) return `${min}m ago`
  return `${sec}s ago`
}

const confidenceColor = (c: number): string => {
  if (c >= 0.7) return 'bg-accent-green'
  if (c >= 0.5) return 'bg-accent-amber'
  return 'bg-accent-red'
}

const directionPill = (dir: string): string => {
  if (dir === 'BUY') return 'bg-accent-green-muted text-accent-green'
  if (dir === 'SHORT' || dir === 'SELL') return 'bg-accent-red-muted text-accent-red'
  return 'bg-surface-tertiary text-txt-secondary'
}

const statusDot = (status: string): { color: string; label: string } => {
  switch (status) {
    case 'active':
      return { color: 'bg-accent-green', label: 'Active' }
    case 'pending':
      return { color: 'bg-accent-amber', label: 'Pending' }
    case 'cancelled':
      return { color: 'bg-accent-red', label: 'Cancelled' }
    case 'closed':
    default:
      return { color: 'bg-surface-tertiary', label: 'Closed' }
  }
}

function safePrice(v: number | null): string {
  return v == null || Number.isNaN(v) ? '—' : v.toFixed(2)
}

export default function TradingSignals() {
  const [signals, setSignals] = useState<TradingSignal[]>([])
  const [ticker, setTicker] = useState('AAPL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [strategy, setStrategy] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  const load = () => {
    setLoading(true)
    setError(null)
    fetchTradingSignals({
      ticker: ticker ? ticker.toUpperCase() : undefined,
      direction: direction === 'all' ? undefined : direction,
      strategy: strategy === 'all' ? undefined : strategy,
      status: status === 'all' ? undefined : status,
      limit: 60,
    })
      .then(setSignals)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to fetch trading signals'),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await generateTradingSignals([ticker.toUpperCase()])
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed generating signals')
    } finally {
      setBusy(false)
    }
  }

  const onStatusChange = async (id: string, newStatus: 'cancelled' | 'closed') => {
    try {
      const updated = await updateSignalStatus(id, newStatus)
      setSignals((prev) => prev.map((s) => (s.id === id ? updated : s)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update signal status')
    }
  }

  const activeCount = useMemo(
    () => signals.filter((s) => s.status === 'active').length,
    [signals],
  )

  const hasAnySignals = signals.length > 0

  const filteredSignals = signals

  const renderEmptyState = () => {
    if (!hasAnySignals) {
      return (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 text-2xl text-txt-secondary">◇</div>
          <div className="font-mono font-semibold mb-1">No trading signals yet.</div>
          <div className="text-sm text-txt-tertiary max-w-md">
            Enter a ticker above and click Generate Signal to get AI-driven trade recommendations.
          </div>
        </div>
      )
    }
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 text-2xl text-txt-secondary">◇</div>
        <div className="font-mono font-semibold mb-1">No signals match your filters</div>
        <div className="text-sm text-txt-tertiary max-w-md">
          Generate a signal or adjust your filters.
        </div>
      </div>
    )
  }

  const skeletonCards = (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="card space-y-3">
          <div className="flex justify-between items-center">
            <div className="skeleton h-5 w-20" />
            <div className="skeleton h-6 w-16 rounded-full" />
          </div>
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-24" />
          </div>
          <div className="space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      {/* Header Bar */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-mono font-bold text-lg">Trading Signals</h2>
        <div className="flex items-center gap-3">
          <span className="pill bg-accent-green-muted text-accent-green text-xs">
            {activeCount} active
          </span>
          <div className="flex gap-2">
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="bg-surface-secondary border border-border rounded px-3 py-2 text-sm"
              placeholder="Ticker"
            />
            <button className="btn-primary" onClick={onGenerate} disabled={busy}>
              {busy ? 'Generating...' : 'Generate Signal'}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card mb-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        {/* Direction filter */}
        <div className="flex-1">
          <div className="label mb-1">Direction</div>
          <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
            {(['all', 'BUY', 'SHORT', 'SELL'] as DirectionFilter[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`px-3 py-1 rounded-md transition ${
                  direction === d
                    ? 'bg-surface-tertiary text-txt-primary'
                    : 'text-txt-secondary'
                }`}
              >
                {d === 'all' ? 'All' : d}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy filter */}
        <div className="flex-1">
          <div className="label mb-1">Strategy</div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full bg-surface-secondary border border-border rounded px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="Momentum">Momentum</option>
            <option value="Mean Reversion">Mean Reversion</option>
            <option value="Breakout">Breakout</option>
            <option value="Ensemble">Ensemble</option>
            <option value="ML Ensemble">ML Ensemble</option>
          </select>
        </div>

        {/* Status filter */}
        <div className="flex-1">
          <div className="label mb-1">Status</div>
          <div className="inline-flex bg-surface-secondary rounded-lg p-1 border border-border text-xs">
            {(['all', 'pending', 'active', 'closed'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-3 py-1 rounded-md transition ${
                  status === s
                    ? 'bg-surface-tertiary text-txt-primary'
                    : 'text-txt-secondary'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="card mb-3 text-accent-red text-sm">{error}</div>}

      {loading ? (
        skeletonCards
      ) : filteredSignals.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSignals.map((s) => {
            const statusMeta = statusDot(s.status)
            const confidencePct = Math.round((s.confidence ?? 0) * 100)
            const ladder = {
              entry: s.entry_price,
              target: s.target_price,
              stop: s.stop_loss,
            }
            const entryPrice = ladder.entry ?? 0
            const pctToTarget =
              ladder.target != null && entryPrice
                ? ((ladder.target - entryPrice) / entryPrice) * 100
                : null
            const pctToStop =
              ladder.stop != null && entryPrice
                ? ((ladder.stop - entryPrice) / entryPrice) * 100
                : null

            const metadata = (s as any).metadata ?? {}
            const reason: string | undefined = metadata.reason
            const timeframe = (s.timeframe as string) || 'swing'

            return (
              <div key={s.id} className="card flex flex-col gap-3">
                {/* Card header */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono font-bold text-2xl">{s.ticker}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <span className={`pill text-xs ${directionPill(s.direction)}`}>
                      {s.direction}
                    </span>
                    <div className="flex items-center justify-end gap-1 text-[11px] text-txt-tertiary">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${statusMeta.color}`}
                      />
                      <span>{statusMeta.label}</span>
                    </div>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-surface-tertiary overflow-hidden">
                    <div
                      className={`h-full ${confidenceColor(
                        s.confidence ?? 0,
                      )} transition-all duration-500`}
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono text-txt-secondary">
                    {confidencePct}%
                  </div>
                </div>

                {/* Price ladder */}
                <div className="relative flex flex-col justify-between text-xs font-mono h-24">
                  <div className="flex items-center justify-between text-accent-green">
                    <span>Target</span>
                    <div className="flex items-center gap-2">
                      <span className="border-t border-dashed border-accent-green flex-1 opacity-60" />
                      <span>${safePrice(ladder.target)}</span>
                      <span className="text-[11px] text-accent-green">
                        {pctToTarget != null ? `(${pctToTarget.toFixed(1)}%)` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-txt-primary">
                    <span>Entry</span>
                    <div className="flex items-center gap-2">
                      <span className="border-t border-solid border-txt-primary flex-1 opacity-80" />
                      <span>${safePrice(ladder.entry)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-accent-red">
                    <span>Stop</span>
                    <div className="flex items-center gap-2">
                      <span className="border-t border-dashed border-accent-red flex-1 opacity-60" />
                      <span>${safePrice(ladder.stop)}</span>
                      <span className="text-[11px] text-accent-red">
                        {pctToStop != null ? `(${pctToStop.toFixed(1)}%)` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metadata row */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="pill bg-surface-tertiary text-txt-secondary">
                    {s.strategy_name}
                  </span>
                  <span className="pill bg-surface-tertiary text-txt-secondary">
                    {timeframe.toLowerCase().includes('intra') ? 'intraday' : 'swing'}
                  </span>
                  <span className="pill bg-surface-tertiary text-txt-secondary">
                    {timeAgo(s.created_at)}
                  </span>
                </div>

                {/* Reason */}
                {reason && (
                  <div className="text-[11px] text-txt-tertiary">
                    {reason}
                  </div>
                )}

                {/* Actions */}
                {(s.status === 'pending' || s.status === 'active') && (
                  <div className="flex justify-end gap-4 text-[11px] pt-1">
                    <button
                      type="button"
                      className="text-txt-tertiary hover:text-accent-red"
                      onClick={() => onStatusChange(s.id, 'cancelled')}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="text-txt-tertiary hover:text-accent-amber"
                      onClick={() => onStatusChange(s.id, 'closed')}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
