import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchStats, fetchConfusion, triggerEvaluate, fetchMlReadiness, fetchMlStatus, triggerMlTrain } from '../api'
import type { AccuracyStats, ConfusionMatrix, MlReadiness, MlStatus } from '../types'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { SkeletonStatCard } from './SkeletonCard'
import { useStaggeredList } from '../hooks/useStaggeredList'

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

/**
 * Activation threshold of the isotonic confidence calibrator, mirroring
 * `MIN_SAMPLES` in src/signals/confidence_calibrator.py. Below this the
 * calibrator is the identity function and the pipeline stores raw confidence.
 */
const CALIBRATOR_MIN_SAMPLES = 40

interface CalibrationGate {
  n: number
  wins: number
  active: boolean
  /** Which of the two conditions is missing, when inactive. */
  reason: 'samples' | 'single_class' | null
  progressPct: number
}

/**
 * Derives the calibrator's gating state from the AccuracyStats the API returns,
 * so this is correct against the real backend as well as the demo fixtures.
 * The real rule is: n >= MIN_SAMPLES AND wins != 0 AND wins != n.
 */
function calibrationGate(stats: AccuracyStats): CalibrationGate {
  const n = stats.total_evaluated
  const wins = stats.wins
  const bothClasses = wins > 0 && wins < n
  const enoughSamples = n >= CALIBRATOR_MIN_SAMPLES
  return {
    n,
    wins,
    active: enoughSamples && bothClasses,
    reason: !enoughSamples ? 'samples' : !bothClasses ? 'single_class' : null,
    progressPct: Math.min(100, (n / CALIBRATOR_MIN_SAMPLES) * 100),
  }
}

/**
 * Wilson score interval for a binomial proportion — no continuity correction
 * (the plain Wilson form). Chosen over the normal approximation because it
 * stays inside [0, 1] and behaves sensibly at the small sample sizes this
 * dashboard actually has.
 */
function wilsonInterval(wins: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null
  const p = wins / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  }
}

function outcomeColor(outcome: string | null): string {
  if (outcome === 'profit') return 'bg-accent-green'
  if (outcome === 'loss') return 'bg-accent-red'
  if (outcome === 'expired') return 'bg-txt-tertiary'
  return 'border border-accent-amber bg-transparent h-6 mt-1'
}

export default function AccuracyPanel() {
  const [stats, setStats] = useState<AccuracyStats | null>(null)
  const [confusion, setConfusion] = useState<ConfusionMatrix | null>(null)
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [trainingMl, setTrainingMl] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mlReadiness, setMlReadiness] = useState<MlReadiness | null>(null)
  const [mlStatus, setMlStatus] = useState<MlStatus | null>(null)

  const loadData = () => {
    setLoading(true)
    Promise.all([fetchStats(), fetchConfusion(), fetchMlReadiness(), fetchMlStatus()])
      .then(([s, c, readiness, status]) => {
        setStats(s)
        setConfusion(c)
        setMlReadiness(readiness)
        setMlStatus(status)
      })
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

  const handleTrainMl = () => {
    setTrainingMl(true)
    triggerMlTrain()
      .then(() => loadData())
      .catch(e => setError(e.message))
      .finally(() => setTrainingMl(false))
  }

  // Animated stat values — always called (before any early returns)
  const winRate = useCountUp(stats?.win_rate ?? 0)
  const avgPnl = useCountUp(stats?.avg_pnl ?? 0)
  const totalEval = useCountUp(stats?.total_evaluated ?? 0)
  const totalPending = useCountUp(stats?.total_pending ?? 0)

  // Build stagger data and hook — always called (before any early returns)
  const staggerData = useMemo<{ label: string; value: string; color: string; sub?: string }[]>(
    () => [
      {
        label: 'Win Rate',
        value: `${(winRate * 100).toFixed(1)}%`,
        color: (stats?.win_rate ?? 0) >= 0.5 ? 'text-accent-green' : 'text-accent-red',
        // A win rate is meaningless without its denominator — always attached.
        sub: `n = ${stats?.total_evaluated ?? 0} evaluated`,
      },
      {
        label: 'Avg P&L',
        value: `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%`,
        color: (stats?.avg_pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red',
        sub: 'per evaluated signal',
      },
      {
        label: 'Evaluated',
        value: Math.round(totalEval).toString(),
        color: 'text-txt-primary',
      },
      {
        label: 'Pending',
        value: Math.round(totalPending).toString(),
        color: 'text-accent-amber',
      },
    ],
    [winRate, avgPnl, totalEval, totalPending, stats?.win_rate, stats?.avg_pnl, stats?.total_evaluated]
  )

  const { visibleItems: staggeredStats, getDelay, ready } = useStaggeredList(staggerData)

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
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
  const readiness = mlReadiness ?? mlStatus?.readiness_check ?? null
  const progress = readiness ? Math.min(100, (readiness.signals_with_outcomes / 30) * 100) : 0
  const isTrained = mlStatus?.is_trained ?? false
  const topFeatures = mlStatus?.feature_importances ?? []
  const recentMlComparison = mlStatus?.recent_comparison
  const pnlSignals = stats.recent_signals.filter((signal) => signal.pnl != null)
  let running = 0
  const cumulativePnl = pnlSignals.map((signal) => {
    running += signal.pnl ?? 0
    return {
      date: signal.created_at ? new Date(signal.created_at).toLocaleDateString() : '',
      cumulative: Number(running.toFixed(2)),
    }
  })
  const cumulativeLast = cumulativePnl.length > 0 ? cumulativePnl[cumulativePnl.length - 1].cumulative : 0
  const cumulativePositive = cumulativeLast >= 0

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

      {/* Confidence calibration gate + interval estimate for the raw win rate */}
      <CalibrationCard stats={stats} />

      {/* ML model status */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="label">ML Model</h3>
          <div className={`text-xs font-mono px-2 py-1 rounded ${
            isTrained ? 'bg-accent-green-muted text-accent-green' : 'bg-surface-secondary text-txt-tertiary'
          }`}>
            {isTrained ? 'Trained' : 'Not trained'}
          </div>
        </div>

        {isTrained && mlStatus?.training_metrics ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="text-txt-secondary">Accuracy: <span className="text-txt-primary">{((mlStatus.training_metrics.accuracy ?? 0) * 100).toFixed(1)}%</span></div>
            <div className="text-txt-secondary">F1: <span className="text-txt-primary">{((mlStatus.training_metrics.f1_score ?? 0) * 100).toFixed(1)}%</span></div>
            <div className="text-txt-secondary">Precision: <span className="text-txt-primary">{((mlStatus.training_metrics.precision ?? 0) * 100).toFixed(1)}%</span></div>
            <div className="text-txt-secondary">Recall: <span className="text-txt-primary">{((mlStatus.training_metrics.recall ?? 0) * 100).toFixed(1)}%</span></div>
          </div>
        ) : (
          <p className="text-txt-tertiary text-xs">Model has not been trained yet.</p>
        )}

        {readiness && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-txt-secondary">
              <span>Readiness</span>
              <span className="font-mono">{readiness.signals_with_outcomes}/30</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-secondary">
              <div className="h-full rounded-full bg-accent-blue confidence-bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-txt-tertiary">{readiness.message}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleTrainMl}
            disabled={trainingMl || !(readiness?.ready_to_train)}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {trainingMl ? 'TRAINING...' : 'TRAIN ML MODEL'}
          </button>
          {!readiness?.ready_to_train && (
            <span className="text-xs text-txt-tertiary">Collect more outcomes before training.</span>
          )}
        </div>

        {isTrained && topFeatures.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-txt-tertiary font-sans">Top Feature Importances</h4>
            <div className="space-y-1.5">
              {topFeatures.slice(0, 10).map(([name, importance]) => (
                <div key={name} className="flex items-center gap-3 text-xs">
                  <span className="w-40 truncate text-txt-secondary font-sans">{name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-secondary">
                    <div className="h-full rounded-full bg-accent-green" style={{ width: `${Math.max(2, importance * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono text-txt-tertiary">{(importance * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isTrained && recentMlComparison && recentMlComparison.n_evaluated > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-mono text-txt-secondary">
              Recent comparison ({recentMlComparison.n_evaluated}): ML {(recentMlComparison.model_accuracy * 100).toFixed(1)}% vs Keyword {(recentMlComparison.keyword_accuracy * 100).toFixed(1)}%
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-txt-tertiary uppercase tracking-wider">
                    <th className="text-left pb-2 pr-3">Ticker</th>
                    <th className="text-left pb-2 pr-3">Keyword</th>
                    <th className="text-left pb-2 pr-3">ML</th>
                    <th className="text-left pb-2">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMlComparison.comparison.slice(0, 20).map((row, idx) => (
                    <tr key={`${row.ticker}-${idx}`} className={idx % 2 === 0 ? 'bg-surface-secondary' : ''}>
                      <td className="py-1.5 pr-3 font-mono text-txt-primary">{row.ticker}</td>
                      <td className="py-1.5 pr-3 text-txt-secondary">{row.keyword_prediction}</td>
                      <td className="py-1.5 pr-3 text-txt-secondary">{row.ml_prediction}</td>
                      <td className="py-1.5 text-txt-secondary">{row.actual_outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="label mb-4">Cumulative P&L</h3>
        {cumulativePnl.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cumulativePnl} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cumPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cumulativePositive ? '#00d68f' : '#ff3d5a'} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={cumulativePositive ? '#00d68f' : '#ff3d5a'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888a0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8888a0' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#e8e8ed' }}
                formatter={(value) => {
                  const numeric = Number(value ?? 0)
                  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={cumulativePositive ? '#00d68f' : '#ff3d5a'}
                strokeWidth={1.5}
                fill="url(#cumPnlGrad)"
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-txt-tertiary">Cumulative P&L chart will appear once signals have outcomes.</p>
        )}
      </div>

      {/* Top stats */}
      {stats.total_evaluated === 0 ? (
        <div className="card py-10">
          <div className="text-center max-w-xl mx-auto">
            <div className="text-3xl mb-3 text-accent-blue">{'\u2581\u2583\u2584\u2586\u2588'}</div>
            <p className="font-sans font-semibold text-txt-primary mb-2">Building Your Track Record</p>
            <p className="text-sm text-txt-secondary mb-5">
              Signals are being collected. Accuracy metrics will appear once signals expire and are evaluated.
            </p>
            <div className="w-full h-2 rounded-full bg-surface-tertiary mb-2">
              <div className="h-full rounded-full bg-accent-amber confidence-bar" style={{ width: `${Math.min(100, stats.total_pending * 5)}%` }} />
            </div>
            <p className="text-xs text-txt-tertiary">
              {stats.total_pending} signals pending evaluation — need outcomes to calculate accuracy
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={`stagger-container grid grid-cols-2 lg:grid-cols-4 gap-6 ${ready ? 'is-ready' : ''}`}>
            {staggeredStats.map((stat, index) => (
              <div key={stat.label} className="stagger-item" style={{ animationDelay: getDelay(index) }}>
                <StatCard label={stat.label} value={stat.value} color={stat.color} sub={stat.sub} />
              </div>
            ))}
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

          <div className="card">
            <h3 className="label mb-4">Recent Signal Outcomes</h3>
            <div className="flex flex-wrap gap-1.5">
              {stats.recent_signals.slice(0, 20).map((signal) => (
                <div
                  key={`outcome-${signal.id}`}
                  className={`w-3 h-8 rounded-sm ${outcomeColor(signal.outcome)}`}
                  title={`${signal.ticker} ${signal.direction.toUpperCase()} — ${signal.pnl != null ? `${signal.pnl >= 0 ? '+' : ''}${signal.pnl.toFixed(1)}%` : signal.outcome ?? 'pending'}`}
                />
              ))}
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
              <div
                className="bg-accent-green-muted rounded-lg p-4 text-center transition-all duration-150 hover:brightness-110 hover:border hover:border-accent-green/30"
                title="Predicted Call, market went up — correct prediction"
              >
                <div className="font-mono font-bold text-2xl text-accent-green">{confusion.true_bullish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Call {'\u2713'}</div>
              </div>
              <div
                className="bg-accent-red-muted rounded-lg p-4 text-center transition-all duration-150 hover:brightness-110 hover:border hover:border-accent-red/30"
                title="Predicted Call, market went down — incorrect prediction"
              >
                <div className="font-mono font-bold text-2xl text-accent-red">{confusion.false_bullish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Call {'\u2717'}</div>
              </div>

              <div className="text-txt-secondary text-xs font-sans pr-3 flex items-center">Predicted Put</div>
              <div
                className="bg-accent-red-muted rounded-lg p-4 text-center transition-all duration-150 hover:brightness-110 hover:border hover:border-accent-red/30"
                title="Predicted Put, market went up — incorrect prediction"
              >
                <div className="font-mono font-bold text-2xl text-accent-red">{confusion.false_bearish}</div>
                <div className="text-txt-tertiary text-[10px] mt-1">Predicted Put {'\u2717'}</div>
              </div>
              <div
                className="bg-accent-green-muted rounded-lg p-4 text-center transition-all duration-150 hover:brightness-110 hover:border hover:border-accent-green/30"
                title="Predicted Put, market went down — correct prediction"
              >
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

function CalibrationCard({ stats }: { stats: AccuracyStats }) {
  const gate = calibrationGate(stats)
  const interval = wilsonInterval(gate.wins, gate.n)
  const pointEstimate = gate.n > 0 ? gate.wins / gate.n : null

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="label">Confidence Calibration</h3>
        <span
          className={`text-xs font-mono px-2 py-1 rounded ${
            gate.active
              ? 'bg-accent-green-muted text-accent-green'
              : 'bg-accent-amber-muted text-accent-amber'
          }`}
        >
          {gate.active ? 'Calibrator active' : 'Calibrator inactive'}
        </span>
      </div>

      {/* Gating state — the real activation rule, rendered as progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-txt-secondary">
          <span>
            {gate.active
              ? `Fitted on ${gate.n} evaluated signals (${gate.wins} wins, ${gate.n - gate.wins} non-wins)`
              : gate.reason === 'single_class'
                ? `${gate.n} evaluated signals but only one outcome class present — isotonic fit needs both`
                : `${gate.n} / ${CALIBRATOR_MIN_SAMPLES} evaluated signals, both outcome classes present`}
          </span>
          <span className="font-mono shrink-0">{gate.n}/{CALIBRATOR_MIN_SAMPLES}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-secondary">
          <div
            className={`h-full rounded-full confidence-bar ${gate.active ? 'bg-accent-green' : 'bg-accent-amber'}`}
            style={{ width: `${gate.progressPct}%` }}
          />
        </div>
        <p className="text-xs text-txt-tertiary">
          The isotonic calibrator maps stated confidence onto realized win rate. It stays
          inert until at least {CALIBRATOR_MIN_SAMPLES} signals have been evaluated with
          both wins and non-wins present.{' '}
          {gate.active
            ? 'Stored confidence is calibrated against realized outcomes; raw_confidence is kept for audit.'
            : 'Until then, the confidence shown on every signal is the raw model confidence — not a calibrated probability.'}
        </p>
      </div>

      {/* Raw win rate with an explicit interval and sample size */}
      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-xs text-txt-secondary">Raw win rate (95% Wilson interval)</span>
          {pointEstimate == null || interval == null ? (
            <span className="font-mono text-sm text-txt-tertiary">
              no evaluated signals yet
            </span>
          ) : (
            <span className="font-mono text-sm text-txt-primary">
              {pointEstimate.toFixed(2)}{' '}
              <span className="text-txt-secondary">
                [{interval.low.toFixed(2)}, {interval.high.toFixed(2)}]
              </span>{' '}
              <span className="text-txt-tertiary">at n = {gate.n}</span>
            </span>
          )}
        </div>
        {interval != null && (
          <>
            {/* Interval bar: 0 -> 1 scale with the point estimate marked */}
            <div className="relative w-full h-2 rounded-full bg-surface-secondary">
              <div
                className="absolute top-0 h-full rounded-full bg-accent-blue/40"
                style={{
                  left: `${interval.low * 100}%`,
                  width: `${Math.max(0.5, (interval.high - interval.low) * 100)}%`,
                }}
              />
              {pointEstimate != null && (
                <div
                  className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 bg-accent-blue"
                  style={{ left: `${pointEstimate * 100}%` }}
                />
              )}
            </div>
            <p className="text-xs text-txt-tertiary">
              Plain Wilson score interval (no continuity correction). At this sample size the
              interval is wide enough that the point estimate on its own should not be read
              as an edge.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="card">
      <div className={`stat-number ${color} count-up`}>{value}</div>
      <div className="label mt-2">{label}</div>
      {sub && <div className="mt-1 font-mono text-[10px] text-txt-tertiary">{sub}</div>}
    </div>
  )
}
