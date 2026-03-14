import { useState, useEffect } from 'react'
import { fetchStats, fetchConfusion, triggerEvaluate } from '../api'
import type { AccuracyStats, ConfusionMatrix } from '../types'

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

  if (loading) return <div className="text-center text-gray-500 py-12">Loading accuracy data...</div>
  if (error) return <div className="bg-bearish/10 border border-bearish/30 rounded p-3 text-sm text-bearish">{error}</div>
  if (!stats || !confusion) return null

  const eventTypes = Object.entries(stats.by_event_type)
  const maxWinRate = Math.max(...eventTypes.map(([, d]) => d.win_rate), 0.01)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Accuracy Report</h2>
        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          className="px-4 py-2 rounded bg-info text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {evaluating ? 'Evaluating...' : 'Evaluate Pending'}
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} accent={stats.win_rate >= 0.5 ? 'bullish' : 'bearish'} />
        <StatBox label="Avg P&L" value={`${stats.avg_pnl >= 0 ? '+' : ''}${stats.avg_pnl.toFixed(1)}%`} accent={stats.avg_pnl >= 0 ? 'bullish' : 'bearish'} />
        <StatBox label="Evaluated" value={String(stats.total_evaluated)} accent="info" />
        <StatBox label="Pending" value={String(stats.total_pending)} accent="warning" />
      </div>

      {/* W/L/E breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-bullish">{stats.wins}</div>
          <div className="text-xs text-gray-500 mt-1">Wins</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-bearish">{stats.losses}</div>
          <div className="text-xs text-gray-500 mt-1">Losses</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold font-mono text-gray-400">{stats.expired_flat}</div>
          <div className="text-xs text-gray-500 mt-1">Expired Flat</div>
        </div>
      </div>

      {/* Confusion Matrix */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Confusion Matrix</h3>
        <div className="grid grid-cols-3 gap-1 text-center text-sm max-w-sm">
          <div />
          <div className="text-xs text-gray-500 pb-1">Went Up</div>
          <div className="text-xs text-gray-500 pb-1">Went Down</div>
          <div className="text-xs text-gray-500 text-right pr-2 self-center">Predicted Call</div>
          <div className="bg-bullish/20 rounded p-3 font-mono font-bold text-bullish">{confusion.true_bullish}</div>
          <div className="bg-bearish/10 rounded p-3 font-mono text-bearish">{confusion.false_bullish}</div>
          <div className="text-xs text-gray-500 text-right pr-2 self-center">Predicted Put</div>
          <div className="bg-bearish/10 rounded p-3 font-mono text-bearish">{confusion.false_bearish}</div>
          <div className="bg-bullish/20 rounded p-3 font-mono font-bold text-bullish">{confusion.true_bearish}</div>
        </div>
        <div className="flex gap-6 mt-3 text-xs text-gray-500">
          <div>Call precision: <span className="font-mono text-gray-300">{(confusion.precision_bullish * 100).toFixed(0)}%</span></div>
          <div>Put precision: <span className="font-mono text-gray-300">{(confusion.precision_bearish * 100).toFixed(0)}%</span></div>
          <div>Overall: <span className="font-mono text-gray-300">{(confusion.overall_accuracy * 100).toFixed(0)}%</span></div>
        </div>
      </div>

      {/* Win rate by event type */}
      {eventTypes.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Win Rate by Event Type</h3>
          <div className="space-y-2">
            {eventTypes.map(([type, data]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-28 truncate">{type.replace(/_/g, ' ')}</span>
                <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-info rounded-full"
                    style={{ width: `${(data.win_rate / maxWinRate) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-gray-300 w-12 text-right">
                  {(data.win_rate * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-gray-600 w-16">
                  {data.wins}/{data.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By direction */}
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(stats.by_direction).map(([dir, data]) => (
          <div key={dir} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className={`text-sm font-semibold mb-1 ${dir === 'call' ? 'text-bullish' : 'text-bearish'}`}>
              {dir === 'call' ? 'Calls' : 'Puts'}
            </div>
            <div className="text-xs text-gray-500">
              {data.wins}/{data.count} wins ({(data.win_rate * 100).toFixed(0)}%)
            </div>
          </div>
        ))}
      </div>

      {/* Recent signals */}
      {stats.recent_signals.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Signals</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left pb-2">Date</th>
                  <th className="text-left pb-2">Ticker</th>
                  <th className="text-left pb-2">Dir</th>
                  <th className="text-right pb-2">Strike</th>
                  <th className="text-left pb-2">Expiry</th>
                  <th className="text-right pb-2">Conf</th>
                  <th className="text-left pb-2">Outcome</th>
                  <th className="text-right pb-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_signals.map(s => (
                  <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-1.5 font-mono text-xs text-gray-400">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-1.5 font-mono font-medium">{s.ticker}</td>
                    <td className={`py-1.5 text-xs font-medium ${s.direction === 'call' ? 'text-bullish' : 'text-bearish'}`}>
                      {s.direction.toUpperCase()}
                    </td>
                    <td className="py-1.5 text-right font-mono">${s.strike?.toFixed(0) ?? '—'}</td>
                    <td className="py-1.5 font-mono text-xs text-gray-400">{s.expiry ?? '—'}</td>
                    <td className="py-1.5 text-right font-mono">{(s.confidence * 100).toFixed(0)}%</td>
                    <td className="py-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        s.outcome === 'profit' ? 'bg-bullish/20 text-bullish'
                        : s.outcome === 'loss' ? 'bg-bearish/20 text-bearish'
                        : s.outcome === 'expired' ? 'bg-gray-700 text-gray-400'
                        : 'bg-warning/20 text-warning'
                      }`}>
                        {s.outcome?.toUpperCase() ?? 'PENDING'}
                      </span>
                    </td>
                    <td className={`py-1.5 text-right font-mono text-xs ${
                      (s.pnl ?? 0) >= 0 ? 'text-bullish' : 'text-bearish'
                    }`}>
                      {s.pnl != null ? `${s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  const textColor = accent === 'bullish' ? 'text-bullish'
    : accent === 'bearish' ? 'text-bearish'
    : accent === 'warning' ? 'text-warning'
    : 'text-info'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className={`text-2xl font-bold font-mono ${textColor}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
