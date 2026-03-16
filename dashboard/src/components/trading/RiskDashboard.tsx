import { useEffect, useMemo, useState } from 'react'
import { fetchMarketRegime, fetchRegimeHistory, fetchRiskSummary, fetchRiskLimits } from '../../api'
import type { MarketRegime, RegimeHistoryPoint, RiskSummary, RiskLimitsConfig } from '../../types'
import { useToast } from '../../hooks/useToast'

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

interface RegimeSegment {
  start: Date
  end: Date
  regime: string
}

const formatCurrency = (v: number, digits = 2) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const formatPct = (v: number, digits = 1) =>
  `${v.toFixed(digits)}%`

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const regimeBorderClass = (regime: string | undefined) => {
  switch (regime) {
    case 'bull_trend':
      return 'border-l-4 border-l-accent-green'
    case 'bear_trend':
      return 'border-l-4 border-l-accent-red'
    case 'high_vol':
      return 'border-l-4 border-l-[#a855f7]'
    case 'sideways':
    default:
      return 'border-l-4 border-l-accent-amber'
  }
}

const regimeColor = (regime: string) => {
  switch (regime) {
    case 'bull_trend':
      return 'bg-accent-green'
    case 'bear_trend':
      return 'bg-accent-red'
    case 'high_vol':
      return 'bg-[#a855f7]'
    case 'sideways':
    default:
      return 'bg-accent-amber'
  }
}

const palette = ['#448aff', '#00d68f', '#ffab00', '#ff3d5a', '#a855f7']

function formatSectorName(key: string): string {
  return key
    .split('_')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : ''))
    .join(' ')
}

function buildRegimeSegments(history: RegimeHistoryPoint[]): RegimeSegment[] {
  if (history.length === 0) return []
  const points = history
    .filter((p) => p.timestamp)
    .map((p) => ({ ...p, date: new Date(p.timestamp) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  if (points.length === 0) return []

  const segments: RegimeSegment[] = []
  let currentStart = points[0].date
  let currentRegime = points[0].regime

  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (p.regime !== currentRegime) {
      segments.push({ start: currentStart, end: p.date, regime: currentRegime })
      currentStart = p.date
      currentRegime = p.regime
    }
  }
  const lastPoint = points[points.length - 1]
  segments.push({ start: currentStart, end: lastPoint.date, regime: currentRegime })
  return segments
}

export default function RiskDashboard() {
  const { addToast } = useToast()

  const [regime, setRegime] = useState<MarketRegime | null>(null)
  const [regimeHistory, setRegimeHistory] = useState<RegimeHistoryPoint[]>([])
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null)
  const [riskLimits, setRiskLimits] = useState<RiskLimitsConfig | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')

  useEffect(() => {
    const loadAll = async () => {
      setLoadState('loading')
      try {
        const [reg, history, summary, limits] = await Promise.all([
          fetchMarketRegime(),
          fetchRegimeHistory(30),
          fetchRiskSummary(),
          fetchRiskLimits(),
        ])
        setRegime(reg)
        setRegimeHistory(history)
        setRiskSummary(summary)
        setRiskLimits(limits)
        setLoadState('loaded')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load risk data'
        addToast('error', 'Risk dashboard error', msg)
        setLoadState('error')
      }
    }
    loadAll()
  }, [addToast])

  const isLoading = loadState === 'loading' && !riskSummary

  const segments = useMemo(() => buildRegimeSegments(regimeHistory), [regimeHistory])

  const regimeSummary = useMemo(() => {
    if (segments.length === 0) return null
    const first = segments[0]
    const last = segments[segments.length - 1]
    const totalMs = last.end.getTime() - first.start.getTime() || 1

    const byRegime: Record<string, number> = {}
    segments.forEach((s) => {
      const dur = s.end.getTime() - s.start.getTime()
      byRegime[s.regime] = (byRegime[s.regime] ?? 0) + dur
    })

    let mostRegime = segments[0].regime
    let mostPct = 0
    Object.entries(byRegime).forEach(([name, ms]) => {
      const pct = ms / totalMs
      if (pct > mostPct) {
        mostPct = pct
        mostRegime = name
      }
    })

    const current = segments[segments.length - 1]
    return {
      currentRegime: current.regime,
      currentSince: current.start,
      mostCommon: mostRegime,
      mostPct: mostPct * 100,
      startDate: first.start,
      endDate: last.end,
    }
  }, [segments])

  const positionConcentration = riskSummary?.concentration ?? []
  const hasPositions = positionConcentration.length > 0

  const sectorEntries = useMemo(
    () =>
      riskSummary
        ? Object.entries(riskSummary.sector_exposure)
            .map(([sector, pct]) => ({ sector, pct }))
            .sort((a, b) => b.pct - a.pct)
        : [],
    [riskSummary],
  )

  const circuitBreakerActive =
    !!riskSummary &&
    !!riskSummary.risk_limits &&
    riskSummary.risk_limits.current_drawdown_pct >
      riskSummary.risk_limits.max_drawdown_limit_pct

  const renderGaugeBar = (
    label: string,
    used: number,
    limit: number,
    formatter: (v: number) => string,
  ) => {
    const ratio = limit > 0 ? clamp01(used / limit) : 0
    const pct = ratio * 100
    let color = 'bg-accent-green'
    if (pct >= 80) color = 'bg-accent-red'
    else if (pct >= 60) color = 'bg-accent-amber'

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="label text-xs">{label}</span>
          <span className="text-[11px] text-txt-secondary">
            {formatter(used)} / {formatter(limit)}
          </span>
        </div>
        <div className="h-3 rounded-full bg-surface-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full ${color} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg">Risk Dashboard</h2>
        <span className="text-xs text-txt-secondary">
          {regimeSummary
            ? `Last ${Math.round(
                (regimeSummary.endDate.getTime() - regimeSummary.startDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              )} days`
            : 'Live risk snapshot'}
        </span>
      </div>

      {/* Section 1 — Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Market Regime */}
        <div className={`card ${regimeBorderClass(regime?.regime)}`}>
          <div className="label mb-2">Market Regime</div>
          {isLoading || !regime ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-24" />
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-3 w-32" />
            </div>
          ) : (
            <>
              <div className="font-mono font-bold text-2xl mb-1">
                {regime.regime ?? 'sideways'}
              </div>
              <div className="text-xs text-txt-secondary mb-1">Confidence</div>
              <div className="h-2 rounded-full bg-surface-tertiary overflow-hidden mb-1">
                <div
                  className="h-full bg-accent-blue transition-all duration-500"
                  style={{ width: `${clamp01(regime.confidence) * 100}%` }}
                />
              </div>
              <div className="text-[11px] text-txt-secondary">
                {(clamp01(regime.confidence) * 100).toFixed(0)}%
              </div>
              {regime.vix_level != null && (
                <div className="text-[11px] text-txt-secondary mt-1">
                  VIX: {regime.vix_level.toFixed(1)}
                  {regime.vix_percentile != null &&
                    ` (${regime.vix_percentile.toFixed(0)}th percentile)`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Max Drawdown */}
        <div className="card">
          <div className="label mb-2">Max Drawdown</div>
          {isLoading || !riskSummary || !riskLimits ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-20" />
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-3 w-24" />
            </div>
          ) : (
            <>
              <div
                className={`font-mono font-bold text-2xl ${
                  riskSummary.max_drawdown_pct > 0 ? 'text-accent-red' : 'text-txt-secondary'
                }`}
              >
                {formatPct(riskSummary.max_drawdown_pct, 2)}
              </div>
              <div className="h-2 rounded-full bg-surface-tertiary overflow-hidden my-2">
                <div
                  className="h-full bg-accent-red transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (riskSummary.max_drawdown_pct /
                        (riskSummary.risk_limits.max_drawdown_limit_pct || 1)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <div className="text-xs text-txt-tertiary">
                Limit: {formatPct(riskSummary.risk_limits.max_drawdown_limit_pct, 0)}
              </div>
            </>
          )}
        </div>

        {/* Daily P&L */}
        <div className="card">
          <div className="label mb-2">Daily P&amp;L</div>
          {isLoading || !riskSummary ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-24" />
              <div className="skeleton h-3 w-28" />
            </div>
          ) : (
            <>
              <div
                className={`font-mono font-bold text-2xl ${
                  riskSummary.daily_pnl > 0
                    ? 'text-accent-green'
                    : riskSummary.daily_pnl < 0
                      ? 'text-accent-red'
                      : 'text-txt-primary'
                }`}
              >
                ${formatCurrency(riskSummary.daily_pnl)}
              </div>
              <div className="text-xs text-txt-secondary mt-1">
                {riskSummary.total_value > 0
                  ? `${formatPct(
                      (riskSummary.daily_pnl / riskSummary.total_value) * 100,
                      2,
                    )} of portfolio`
                  : '0.00% of portfolio'}
              </div>
            </>
          )}
        </div>

        {/* Exposure */}
        <div className="card">
          <div className="label mb-2">Exposure</div>
          {isLoading || !riskSummary || !riskLimits ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-16" />
              <div className="skeleton h-3 w-28" />
            </div>
          ) : (
            <>
              <div
                className={`font-mono font-bold text-2xl ${
                  riskSummary.exposure_pct > 80 ? 'text-accent-amber' : 'text-txt-primary'
                }`}
              >
                {formatPct(riskSummary.exposure_pct, 1)}
              </div>
              <div className="text-xs text-txt-secondary mt-1">
                {riskSummary.position_count} of{' '}
                {riskSummary.risk_limits.max_positions} positions
              </div>
            </>
          )}
        </div>

        {/* Win Rate */}
        <div className="card">
          <div className="label mb-2">Win Rate</div>
          {isLoading || !riskSummary ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-16" />
              <div className="skeleton h-3 w-32" />
            </div>
          ) : (
            <>
              <div
                className={`font-mono font-bold text-2xl ${
                  riskSummary.total_trades === 0
                    ? 'text-txt-secondary'
                    : riskSummary.win_rate > 50
                      ? 'text-accent-green'
                      : riskSummary.win_rate < 50
                        ? 'text-accent-red'
                        : 'text-txt-secondary'
                }`}
              >
                {riskSummary.total_trades === 0
                  ? '—'
                  : formatPct(riskSummary.win_rate, 1)}
              </div>
              <div className="text-xs text-txt-secondary mt-1">
                {riskSummary.winning_trades} wins / {riskSummary.losing_trades} losses
              </div>
            </>
          )}
        </div>

        {/* Cash Available */}
        <div className="card">
          <div className="label mb-2">Cash Available</div>
          {isLoading || !riskSummary ? (
            <div className="space-y-2">
              <div className="skeleton h-6 w-24" />
              <div className="skeleton h-3 w-28" />
            </div>
          ) : (
            <>
              <div className="font-mono font-bold text-2xl">
                ${formatCurrency(riskSummary.cash, 0)}
              </div>
              <div className="text-xs text-txt-secondary mt-1">
                {formatPct(riskSummary.cash_pct, 1)} of portfolio
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 2 — Risk Limits Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="label">Risk Limits</div>
        </div>
        {isLoading || !riskSummary || !riskLimits ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-3 w-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-full" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Position Limit */}
              {renderGaugeBar(
                'Positions',
                riskSummary.risk_limits.current_positions,
                riskSummary.risk_limits.max_positions,
                (v) => (Number.isFinite(v) ? String(Math.round(v)) : '0'),
              )}

              {/* Drawdown Limit */}
              {renderGaugeBar(
                'Drawdown',
                riskSummary.risk_limits.current_drawdown_pct,
                riskSummary.risk_limits.max_drawdown_limit_pct,
                (v) => formatPct(v, 1),
              )}

              {/* Daily Loss Limit */}
              {renderGaugeBar(
                'Daily Loss',
                riskSummary.risk_limits.current_daily_loss_pct,
                riskSummary.risk_limits.daily_loss_limit_pct,
                (v) => formatPct(v, 1),
              )}
            </div>

            {circuitBreakerActive && (
              <div className="mt-4 bg-accent-red-muted border border-accent-red/30 rounded-lg p-3 text-accent-red text-sm">
                ⚠ Circuit Breaker Active — New entries blocked
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 3 — Position Concentration */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="label">Position Concentration</div>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-8 w-full" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-40" />
            </div>
          </div>
        ) : !hasPositions ? (
          <div className="text-sm text-txt-secondary">
            Portfolio is 100% cash. No position concentration risk.
          </div>
        ) : (
          <>
            <div className="h-8 rounded-full overflow-hidden flex bg-surface-tertiary mb-3">
              {positionConcentration.map((pos, idx) => {
                const color = palette[idx % palette.length]
                const opacity = idx >= palette.length ? 0.6 : 1
                return (
                  <div
                    key={pos.ticker + idx}
                    className="h-full"
                    style={{
                      width: `${pos.weight_pct}%`,
                      backgroundColor: color,
                      opacity,
                    }}
                  />
                )
              })}
              {riskSummary &&
                riskSummary.cash_pct > 0 &&
                riskSummary.cash_pct < 100 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(0, 100 - positionConcentration.reduce(
                        (acc, p) => acc + p.weight_pct,
                        0,
                      ))}%`,
                    }}
                  />
                )}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px]">
              {positionConcentration.map((pos, idx) => {
                const color = palette[idx % palette.length]
                const opacity = idx >= palette.length ? 0.6 : 1
                return (
                  <div key={pos.ticker + idx} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color, opacity }}
                    />
                    <span className="font-mono text-xs">{pos.ticker}</span>
                    <span className="text-txt-secondary">
                      {pos.weight_pct.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Section 4 — Sector Exposure */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="label">Sector Exposure</div>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ) : sectorEntries.length === 0 ? (
          <div className="text-sm text-txt-secondary">
            No sector exposure data. Open positions to see sector breakdown.
          </div>
        ) : (
          <div className="space-y-3">
            {sectorEntries.map(({ sector, pct }) => {
              const warn = pct > 33
              return (
                <div key={sector} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-txt-secondary">
                    {formatSectorName(sector)}
                  </div>
                  <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-blue transition-all duration-500"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs font-mono">
                    {pct.toFixed(1)}%
                  </div>
                  {warn && (
                    <div className="text-[11px] text-accent-amber flex items-center gap-1">
                      <span>⚠</span>
                      <span>High concentration</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Section 5 — Regime History Timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="label">Regime History (30 days)</div>
          <span className="text-[10px] text-txt-secondary">
            {regimeHistory.length} points
          </span>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ) : segments.length === 0 ? (
          <div className="text-sm text-txt-secondary">
            No regime history yet. Regime is detected when the signal engine runs.
          </div>
        ) : (
          <>
            <div className="h-10 rounded-lg overflow-hidden flex mb-3 bg-surface-tertiary">
              {(() => {
                const first = segments[0].start.getTime()
                const last = segments[segments.length - 1].end.getTime() || first + 1
                const total = last - first || 1
                return segments.map((s, idx) => {
                  const width = ((s.end.getTime() - s.start.getTime()) / total) * 100
                  return (
                    <div
                      key={`${s.regime}-${idx}`}
                      className={regimeColor(s.regime)}
                      style={{ width: `${Math.max(1, width)}%` }}
                    />
                  )
                })
              })()}
            </div>
            {regimeSummary && (
              <div className="flex items-center justify-between text-[11px] text-txt-secondary mb-2">
                <span>
                  {regimeSummary.startDate.toLocaleDateString()} →{' '}
                  {regimeSummary.endDate.toLocaleDateString()}
                </span>
                <span>
                  Current:{' '}
                  <span className="font-mono">{regimeSummary.currentRegime}</span> since{' '}
                  {regimeSummary.currentSince.toLocaleDateString()}
                </span>
                <span>
                  Most common:{' '}
                    <span className="font-mono">{regimeSummary.mostCommon}</span> (
                  {regimeSummary.mostPct.toFixed(0)}% of period)
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
