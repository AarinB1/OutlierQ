import type { Signal } from '../types'

interface Props {
  signal: Signal
}

function confidenceColor(c: number): string {
  if (c >= 0.7) return 'bg-accent-green'
  if (c >= 0.4) return 'bg-accent-amber'
  return 'bg-accent-red'
}

export default function SignalCard({ signal }: Props) {
  const isCall = signal.direction === 'call'

  return (
    <div className={`card relative overflow-hidden border-l-[3px] ${isCall ? 'border-l-accent-green' : 'border-l-accent-red'}`}>
      {/* Top row: ticker + direction */}
      <div className="flex items-start justify-between mb-4">
        <span className="font-mono font-bold text-2xl text-txt-primary tracking-tight">
          {signal.ticker}
        </span>
        <span className={`pill ${isCall
          ? 'bg-accent-green-muted text-accent-green'
          : 'bg-accent-red-muted text-accent-red'
        }`}>
          {isCall ? 'CALL' : 'PUT'}
        </span>
      </div>

      {/* Strike + Expiry */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-xl text-txt-primary">
          ${signal.suggested_strike?.toFixed(2) ?? '\u2014'}
        </span>
        <span className="text-txt-secondary text-[13px]">
          exp {signal.suggested_expiry ?? '\u2014'}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-txt-secondary text-xs">Confidence</span>
          <span className="font-mono text-xs text-txt-secondary">
            {(signal.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className={`confidence-bar h-full rounded-full ${confidenceColor(signal.confidence)}`}
            style={{ width: `${signal.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Event type */}
      {signal.event && (
        <div className="mb-3">
          <span className="inline-block px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-secondary text-[11px] font-sans font-medium">
            {signal.event.event_type.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Outcome + P&L */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            signal.outcome === 'profit' ? 'bg-accent-green'
            : signal.outcome === 'loss' ? 'bg-accent-red'
            : signal.outcome === 'expired' ? 'bg-txt-tertiary'
            : 'bg-accent-amber'
          }`} />
          <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
            signal.outcome === 'profit' ? 'text-accent-green'
            : signal.outcome === 'loss' ? 'text-accent-red'
            : signal.outcome === 'expired' ? 'text-txt-tertiary'
            : 'text-accent-amber'
          }`}>
            {signal.outcome?.toUpperCase() ?? 'PENDING'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {signal.outcome_pnl != null && (
            <span className={`font-mono text-xs ${
              signal.outcome_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
            }`}>
              {signal.outcome_pnl >= 0 ? '+' : ''}{signal.outcome_pnl.toFixed(1)}%
            </span>
          )}
          <span className="text-txt-tertiary text-[11px] font-sans">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
