import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchMarketRegime,
  fetchRegimeHistory,
  fetchRiskSummary,
  fetchRiskLimits,
} from '../../api'
import type { MarketRegime, RegimeHistoryPoint, RiskSummary, RiskLimitsConfig } from '../../types'
import { useToast } from '../../hooks/useToast'

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

const formatPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`

const formatAbsPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '—' : `${(v * 100).toFixed(digits)}%`

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
          fetchRegimeHistory(90),
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

  const sectorRows = useMemo(() => {
    if (!riskSummary) return []
    const entries = Object.entries(riskSummary.sector_exposure)
    const total = riskSummary.total_gross_exposure || 1
    return entries
      .map(([sector, value]) => ({
        sector,
        notional: value,
        pct: total !== 0 ? Math.abs(value) / total : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6)
  }, [riskSummary])

  const concentrationRows = useMemo(() => {
    if (!riskSummary) return []
    const entries = Object.entries(riskSummary.ticker_exposure)
    const total = riskSummary.total_gross_exposure || 1
    return entries
      .map(([ticker, value]) => ({
        ticker,
        notional: value,
        pct: total !== 0 ? Math.abs(value) / total : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8)
  }, [riskSummary])

  const regimeSeries = useMemo(
    () =>
      regimeHistory.map((p) => ({
        date: p.timestamp.slice(0, 10),
        confidence: p.confidence,
      })),
    [regimeHistory],
  )

  const isLoading = loadState === 'loading' && !regime && !riskSummary

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg">Risk Dashboard</h2>
        <span className="text-xs text-txt-secondary">
          {regime?.timestamp ? `Last updated ${regime.timestamp}` : 'Live risk snapshot'}
        </span>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <div className="label mb-1">Market Regime</div>
          <div className="text-xl font-mono">
            {regime?.regime ?? (isLoading ? 'Loading…' : 'sideways')}
          </div>
          <div className="text-xs text-txt-secondary">
            Confidence {((regime?.confidence ?? 0) * 100).toFixed(0)}%
          </div>
        </div>
        <div className="card">
          <div className="label mb-1">Gross Exposure</div>
          <div className="text-xl font-mono">
            {riskSummary
              ? `$${riskSummary.total_gross_exposure.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}`
              : isLoading
              ? 'Loading…'
              : '$0'}
          </div>
          <div className="text-xs text-txt-secondary">
            Limit {riskLimits ? `${riskLimits.max_gross_exposure.toFixed(1)}x equity` : '—'}
          </div>
        </div>
        <div className="card">
          <div className="label mb-1">Max Single-Name</div>
          <div className="text-xl font-mono">
            {formatAbsPct(riskSummary?.max_single_name_exposure_pct, 1)}
          </div>
          <div className="text-xs text-txt-secondary">
            Limit {riskLimits ? formatPct(riskLimits.max_single_name_pct, 1) : '—'}
          </div>
        </div>
        <div className="card">
          <div className="label mb-1">Realized PnL</div>
          <div
            className={`text-xl font-mono ${
              (riskSummary?.realized_pnl ?? 0) > 0
                ? 'text-accent-green'
                : (riskSummary?.realized_pnl ?? 0) < 0
                  ? 'text-accent-red'
                  : ''
            }`}
          >
            {riskSummary
              ? `$${riskSummary.realized_pnl.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}`
              : isLoading
              ? 'Loading…'
              : '$0'}
          </div>
          <div className="text-xs text-txt-secondary">Closed trade PnL</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk limits card */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="label">Risk Limits</div>
          </div>
          {riskLimits ? (
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-txt-secondary">Max gross exposure</dt>
                <dd className="font-mono">{riskLimits.max_gross_exposure.toFixed(1)}x</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-txt-secondary">Max single-name</dt>
                <dd className="font-mono">{formatPct(riskLimits.max_single_name_pct, 1)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-txt-secondary">Max sector</dt>
                <dd className="font-mono">{formatPct(riskLimits.max_sector_pct, 1)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-txt-secondary">Max drawdown</dt>
                <dd className="font-mono">{formatPct(riskLimits.max_drawdown_pct, 1)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-txt-secondary">Max leverage</dt>
                <dd className="font-mono">{riskLimits.max_leverage.toFixed(1)}x</dd>
              </div>
            </dl>
          ) : (
            <div className="text-xs text-txt-secondary">No limits configuration available.</div>
          )}
        </div>

        {/* Concentration table */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="label">Position Concentration</div>
            <span className="text-[10px] text-txt-secondary">
              Top {concentrationRows.length || 0} names
            </span>
          </div>
          {concentrationRows.length === 0 ? (
            <div className="text-xs text-txt-secondary">No open positions.</div>
          ) : (
            <div className="space-y-2">
              {concentrationRows.map((row) => (
                <div key={row.ticker} className="flex items-center justify-between gap-2">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-mono text-xs w-14">{row.ticker}</span>
                    <div className="flex-1 h-2 bg-bg-subtle rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.notional >= 0 ? 'bg-accent-blue' : 'bg-accent-red'
                        }`}
                        style={{ width: `${Math.min(row.pct * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-right w-20">
                    {(row.pct * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sector exposure */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <div className="label">Sector Exposure</div>
            <span className="text-[10px] text-txt-secondary">
              Top {sectorRows.length || 0} sectors
            </span>
          </div>
          {sectorRows.length === 0 ? (
            <div className="text-xs text-txt-secondary">No sector exposure data.</div>
          ) : (
            <div className="space-y-2">
              {sectorRows.map((row) => (
                <div key={row.sector} className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="truncate max-w-[120px]">{row.sector}</span>
                      <span className="font-mono">{(row.pct * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-bg-subtle rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          row.notional >= 0 ? 'bg-accent-green' : 'bg-accent-red'
                        }`}
                        style={{ width: `${Math.min(row.pct * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Regime history timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="label">Regime Confidence (Last 90d)</div>
          <span className="text-[10px] text-txt-secondary">
            {regimeHistory.length} points
          </span>
        </div>
        {regimeSeries.length === 0 ? (
          <div className="text-xs text-txt-secondary">No regime history available.</div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={regimeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : String(v ?? '')
                  }
                  labelFormatter={(label: string) => label}
                />
                <Area
                  type="monotone"
                  dataKey="confidence"
                  stroke="#38bdf8"
                  fill="rgba(56,189,248,0.25)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
