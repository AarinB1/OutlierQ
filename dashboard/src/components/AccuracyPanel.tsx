import { useState, useEffect, useRef } from 'react'
import { fetchStats, fetchConfusion, triggerEvaluate } from '../api'
import type { AccuracyStats, ConfusionMatrix } from '../types'

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    const start = ref.current
    const diff = target - start
    if (diff === 0) return
    const startTime = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = start + diff * eased
      setValue(current)
      if (progress < 1) requestAnimationFrame(animate)
      else ref.current = target
    }
    requestAnimationFrame(animate)
  }, [target, duration])
  return value
}

export default function AccuracyPanel() {
  const [stats, setStats] = useState<AccuracyStats | null>(null)
  const [confusion, setConfusion] = useState<ConfusionMatrix | null>(null)
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    Promise.all([fetchStats(), fetchConfusion()])
      .then(([s, c]) => { setStats(s); setConfusion(c) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(loadData, [])

  const handleEvaluate = () => {
    setEvaluating(true)
    triggerEvaluate()
      .then(() => loadData())
      .catch(e => setError(e.message))
      .finally(() => setEvaluating(false))
  }

  // Animated stat values
  const winRate = useCountUp(stats?.win_rate ?? 0)
  const avgPnl = useCountUp(stats?.avg_pnl ?? 0)
  const totalEval = useCountUp(stats?.total_evaluated ?? 0)
  const totalPending = useCountUp(stats?.total_pending ?? 0)

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
      </div>
      <div className="skeleton h-48" />
      <div className="skeleton h-64" />
    </div>
  )

  if (error) return (
    <div className="card border-accent-red/30 bg-accent-red-muted">
      <p className="text-accent-red text-sm">{error}</p>
    </div>
  )

  if (!stats || !confusion) return null

  const eventTypes = Object.entries(stats.by_event_type).sort((a, b) => b[1].win_rate - a[1].win_rate)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u25CE'} Accuracy
        </h2>
        <button onClick={handleEvaluate} disabled={evaluating} className="btn-primary">
          {evaluating ? 'EVALUATING...' : 'EVALUATE PENDING'}
        </button>
      </div>

      {/* Top stats */}
      {stats.total_evaluated === 0 && stats.total_pending === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No evaluated signals yet.</p>
          <p className="text-txt-tertiary text-xs">Signals will be evaluated after their expiry dates pass.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              label="Win Rate"
              value={`${(winRate * 100).toFixed(1)}%`}
              color={(stats.win_rate) >= 0.5 ? 'text-accent-green' : 'text-accent-red'}
            />
            <StatCard
              label="Avg P&L"
              value={`${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%`}
              color={(stats.avg_pnl) >= 0 ? 'text-accent-green' : 'text-accent-red'}
            />
            <StatCard
              label="Evaluated"
              value={Math.round(totalEval).toString()}
              color="text-txt-primary"
            />
            <StatCard
              label="Pending"
              value={Math.round(totalPending).toString()}
              color="text-accent-amber"
            />
          </div>

          {/* W / L / E */}
          <div className="grid grid-cols-3 gap-6">
            <div className="card text-center">
              <div className="stat-number text-accent-green mb-1">{stats.wins}</div>
              <div className="label">Wins</div>
            </div>
            <div className="card text-center">
              <div className="stat-number text-accent-red mb-1">{stats.losses}</div>
              <div className="label">Losses</div>
            </div>
            <div className="card text-center">
              <div className="stat-number text-txt-tertiary mb-1">{stats.expired_flat}</div>
              <div className="label">Expired Flat</div>
            </div>
          </div>

          {/* Confusion Matrix */}
          <div className="card">
            <h3 className="label mb-4">Confusion Matrix</h3>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 max-w-md">
              <div />
              <div className="text-center text-txt-tertiary text-[11px] font-sans font-medium uppercase tracking-wider pb-2">Actually Up</div>
              <div className="text-center text-txt-tertiary text-[11px] font-sans font-medium uppercase tracking-wider pb-2">Actually Down</div>

              <div className="text-txt-secondary text-xs font-sans pr-3 flex items-center">Predicted Call</div>
              <div className="bg-accent-green-muted rounded-lg p-4 text-center">
                <div className="font-mono font-bold text-2xl text-accent-green">{confusion.true_bullish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Call {'\u2713'}</div>
              </div>
              <div className="bg-accent-red-muted rounded-lg p-4 text-center">
                <div className="font-mono font-bold text-2xl text-accent-red">{confusion.false_bullish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Call {'\u2717'}</div>
              </div>

              <div className="text-txt-secondary text-xs font-sans pr-3 flex items-center">Predicted Put</div>
              <div className="bg-accent-red-muted rounded-lg p-4 text-center">
                <div className="font-mono font-bold text-2xl text-accent-red">{confusion.false_bearish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Put {'\u2717'}</div>
              </div>
              <div className="bg-accent-green-muted rounded-lg p-4 text-center">
                <div className="font-mono font-bold text-2xl text-accent-green">{confusion.true_bearish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Put {'\u2713'}</div>
              </div>
            </div>
            <div className="flex gap-8 mt-4 text-txt-tertiary text-xs font-sans">
              <span>Call precision: <span className="font-mono text-txt-secondary">{(confusion.precision_bullish * 100).toFixed(0)}%</span></span>
              <span>Put precision: <span className="font-mono text-txt-secondary">{(confusion.precision_bearish * 100).toFixed(0)}%</span></span>
              <span>Overall: <span className="font-mono text-txt-primary">{(confusion.overall_accuracy * 100).toFixed(0)}%</span></span>
            </div>
          </div>

          {/* Win rate by event type */}
          {eventTypes.length > 0 && (
            <div className="card">
              <h3 className="label mb-4">Win Rate by Event Type</h3>
              <div className="space-y-3">
                {eventTypes.map(([type, data]) => (
                  <div key={type} className="flex items-center gap-4">
                    <span className="text-txt-secondary text-xs font-sans w-32 truncate capitalize">
                      {type.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div
                        className="confidence-bar h-full rounded-full bg-accent-green"
                        style={{ width: `${data.win_rate * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-txt-secondary w-12 text-right">
                      {(data.win_rate * 100).toFixed(0)}%
                    </span>
                    <span className="text-txt-tertiary text-xs font-mono w-12 text-right">
                      {data.wins}/{data.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By direction */}
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(stats.by_direction).map(([dir, data]) => (
              <div key={dir} className="card">
                <div className={`font-mono font-bold text-sm mb-1 ${dir === 'call' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {dir === 'call' ? 'Calls' : 'Puts'}
                </div>
                <div className="text-txt-secondary text-xs font-sans">
                  <span className="font-mono text-txt-primary">{data.wins}</span>/{data.count} wins
                  <span className="font-mono text-txt-secondary ml-2">({(data.win_rate * 100).toFixed(0)}%)</span>
                </div>
              </div>
            ))}
          </div>

          {/* Recent signals */}
          {stats.recent_signals.length > 0 && (
            <div className="card overflow-hidden">
              <h3 className="label mb-4">Recent Signals</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-txt-tertiary uppercase tracking-wider font-sans font-semibold">
                      <th className="text-left pb-3 pr-4">Date</th>
                      <th className="text-left pb-3 pr-4">Ticker</th>
                      <th className="text-left pb-3 pr-4">Dir</th>
                      <th className="text-right pb-3 pr-4">Strike</th>
                      <th className="text-left pb-3 pr-4">Expiry</th>
                      <th className="text-right pb-3 pr-4">Conf</th>
                      <th className="text-left pb-3 pr-4">Outcome</th>
                      <th className="text-right pb-3">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_signals.map((s, i) => (
                      <tr key={s.id} className={`transition-colors duration-150 hover:bg-surface-tertiary ${
                        i % 2 === 0 ? 'bg-surface-secondary' : 'bg-surface-primary'
                      }`}>
                        <td className="py-2.5 pr-4 font-mono text-xs text-txt-tertiary">
                          {s.created_at ? new Date(s.created_at).toLocaleDateString() : '\u2014'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono font-bold text-txt-primary">{s.ticker}</td>
                        <td className={`py-2.5 pr-4 font-mono text-xs font-bold ${s.direction === 'call' ? 'text-accent-green' : 'text-accent-red'}`}>
                          {s.direction.toUpperCase()}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-txt-primary">${s.strike?.toFixed(0) ?? '\u2014'}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-txt-tertiary">{s.expiry ?? '\u2014'}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <div className="h-full rounded-full bg-accent-green confidence-bar" style={{ width: `${s.confidence * 100}%` }} />
                            </div>
                            <span className="font-mono text-xs text-txt-secondary">{(s.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              s.outcome === 'profit' ? 'bg-accent-green'
                              : s.outcome === 'loss' ? 'bg-accent-red'
                              : s.outcome === 'expired' ? 'bg-txt-tertiary'
                              : 'bg-accent-amber'
                            }`} />
                            <span className={`text-[11px] font-mono font-bold uppercase ${
                              s.outcome === 'profit' ? 'text-accent-green'
                              : s.outcome === 'loss' ? 'text-accent-red'
                              : s.outcome === 'expired' ? 'text-txt-tertiary'
                              : 'text-accent-amber'
                            }`}>
                              {s.outcome?.toUpperCase() ?? 'PENDING'}
                            </span>
                          </div>
                        </td>
                        <td className={`py-2.5 text-right font-mono text-xs ${
                          (s.pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
                        }`}>
                          {s.pnl != null ? `${s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(1)}%` : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card">
      <div className={`stat-number ${color} count-up`}>{value}</div>
      <div className="label mt-2">{label}</div>
    </div>
  )
}
