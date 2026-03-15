import { useEffect, useState } from 'react'
import type { TradingSignal, TradingMetrics } from '../types'
import { api } from '../api'

export default function TradingSignals() {
  const [signals, setSignals] = useState<TradingSignal[]>([])
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'confidence' | 'created_at'>('created_at')

  useEffect(() => {
    Promise.all([api.getSignals(), api.getMetrics()])
      .then(([sigs, m]) => {
        setSignals(sigs)
        setMetrics(m)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...signals].sort((a, b) =>
    sortBy === 'confidence'
      ? b.confidence - a.confidence
      : (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-28 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-sans">Trading Signals</h2>
        <div className="flex gap-2">
          <button
            className={`btn-secondary ${sortBy === 'created_at' ? '!border-accent-blue !text-accent-blue' : ''}`}
            onClick={() => setSortBy('created_at')}
          >
            Recent
          </button>
          <button
            className={`btn-secondary ${sortBy === 'confidence' ? '!border-accent-blue !text-accent-blue' : ''}`}
            onClick={() => setSortBy('confidence')}
          >
            Confidence
          </button>
        </div>
      </div>

      {/* Metrics row */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Signals" value={metrics.total_signals} />
          <StatCard label="Active" value={metrics.active_signals} color="blue" />
          <StatCard label="Win Rate" value={`${(metrics.win_rate * 100).toFixed(0)}%`} color="green" />
          <StatCard label="Total P&L" value={`$${metrics.total_pnl.toFixed(0)}`} color={metrics.total_pnl >= 0 ? 'green' : 'red'} />
        </div>
      )}

      {/* Signal cards */}
      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="card text-center py-12 text-txt-secondary">
            No trading signals yet. Generate signals from the Strategy page.
          </div>
        )}
        {sorted.map((sig) => (
          <SignalCard key={sig.id} signal={sig} />
        ))}
      </div>
    </div>
  )
}

function SignalCard({ signal }: { signal: TradingSignal }) {
  const dirColor = signal.direction === 'BUY'
    ? 'text-accent-green bg-accent-green-muted'
    : 'text-accent-red bg-accent-red-muted'

  return (
    <div className="card flex items-center gap-6">
      {/* Direction badge */}
      <div className={`pill ${dirColor}`}>{signal.direction}</div>

      {/* Ticker + strategy */}
      <div className="min-w-[100px]">
        <div className="font-mono font-bold text-lg">{signal.ticker}</div>
        <div className="text-xs text-txt-tertiary">{signal.strategy_name}</div>
      </div>

      {/* Prices */}
      <div className="flex gap-6 text-sm font-mono">
        <div>
          <span className="label block">Entry</span>
          ${signal.entry_price?.toFixed(2) ?? '—'}
        </div>
        <div>
          <span className="label block">Target</span>
          <span className="text-accent-green">${signal.target_price?.toFixed(2) ?? '—'}</span>
        </div>
        <div>
          <span className="label block">Stop</span>
          <span className="text-accent-red">${signal.stop_loss?.toFixed(2) ?? '—'}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex-1 ml-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="label">Confidence</span>
          <span className="font-mono">{(signal.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              signal.confidence > 0.7 ? 'bg-accent-green' : signal.confidence > 0.5 ? 'bg-accent-amber' : 'bg-accent-red'
            }`}
            style={{ width: `${signal.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Timeframe */}
      <div className="pill bg-surface-tertiary text-txt-secondary">
        {signal.timeframe ?? 'swing'}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === 'green' ? 'text-accent-green' : color === 'red' ? 'text-accent-red' : color === 'blue' ? 'text-accent-blue' : 'text-txt-primary'
  return (
    <div className="card">
      <div className="label mb-2">{label}</div>
      <div className={`stat-number ${colorClass}`}>{value}</div>
    </div>
  )
}
