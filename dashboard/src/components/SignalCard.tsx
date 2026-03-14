import type { Signal } from '../types'

interface Props {
  signal: Signal
}

function confidenceColor(c: number): string {
  if (c >= 0.7) return 'bg-bullish'
  if (c >= 0.4) return 'bg-warning'
  return 'bg-bearish'
}

function outcomeColor(o: string | null): string {
  if (o === 'profit') return 'bg-bullish/20 text-bullish border-bullish/30'
  if (o === 'loss') return 'bg-bearish/20 text-bearish border-bearish/30'
  if (o === 'expired') return 'bg-gray-700/50 text-gray-400 border-gray-600'
  return 'bg-warning/20 text-warning border-warning/30'
}

export default function SignalCard({ signal }: Props) {
  const isCall = signal.direction === 'call'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded text-xs font-bold tracking-wider ${
            isCall ? 'bg-bullish/20 text-bullish' : 'bg-bearish/20 text-bearish'
          }`}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-xl font-bold font-mono">{signal.ticker}</span>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs border ${outcomeColor(signal.outcome)}`}>
          {signal.outcome ? signal.outcome.toUpperCase() : 'PENDING'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Strike</span>
          <span className="ml-2 font-mono text-gray-200">
            ${signal.suggested_strike?.toFixed(0) ?? '—'}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Expiry</span>
          <span className="ml-2 font-mono text-gray-200">{signal.suggested_expiry ?? '—'}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Confidence</span>
          <span className="font-mono">{(signal.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`confidence-bar h-full rounded-full ${confidenceColor(signal.confidence)}`}
            style={{ width: `${signal.confidence * 100}%` }}
          />
        </div>
      </div>

      {signal.event && (
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-info/20 text-info">
            {signal.event.event_type.replace(/_/g, ' ')}
          </span>
          <span className="text-gray-500">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
        </div>
      )}

      {signal.outcome_pnl != null && (
        <div className="text-xs font-mono">
          <span className="text-gray-500">P&L: </span>
          <span className={signal.outcome_pnl >= 0 ? 'text-bullish' : 'text-bearish'}>
            {signal.outcome_pnl >= 0 ? '+' : ''}{signal.outcome_pnl.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
