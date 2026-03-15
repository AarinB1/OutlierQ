import type { SignalOverlay } from '../types'

interface Props {
  signals: SignalOverlay[]
}

export default function SignalHistory({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className="card">
        <h3 className="label mb-3">Signal History</h3>
        <p className="text-txt-tertiary text-xs">No signals for this ticker.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="label mb-3">Signal History</h3>
      <div className="space-y-2">
        {signals.map(s => {
          const isCall = s.direction === 'call'
          return (
            <div key={s.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
              <span className={`w-1.5 h-1.5 rounded-full ${isCall ? 'bg-accent-green' : 'bg-accent-red'}`} />
              <span className={`font-mono text-xs font-bold w-10 ${isCall ? 'text-accent-green' : 'text-accent-red'}`}>
                {s.direction.toUpperCase()}
              </span>
              <span className="font-mono text-xs text-txt-primary">
                ${s.strike?.toFixed(0) ?? '\u2014'}
              </span>
              <span className="font-mono text-[10px] text-txt-tertiary">
                {s.expiry ?? ''}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  s.outcome === 'profit' ? 'bg-accent-green'
                  : s.outcome === 'loss' ? 'bg-accent-red'
                  : s.outcome === 'expired' ? 'bg-txt-tertiary'
                  : 'bg-accent-amber'
                }`} />
                <span className={`text-[10px] font-mono font-bold uppercase ${
                  s.outcome === 'profit' ? 'text-accent-green'
                  : s.outcome === 'loss' ? 'text-accent-red'
                  : s.outcome === 'expired' ? 'text-txt-tertiary'
                  : 'text-accent-amber'
                }`}>
                  {s.outcome?.toUpperCase() ?? 'PENDING'}
                </span>
              </span>
              {s.pnl != null && (
                <span className={`font-mono text-[10px] w-12 text-right ${s.pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
