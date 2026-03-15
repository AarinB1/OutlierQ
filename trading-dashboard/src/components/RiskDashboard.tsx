import { useEffect, useState } from 'react'
import type { PortfolioData, RegimeData, TradingMetrics } from '../types'
import { api } from '../api'

export default function RiskDashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [regime, setRegime] = useState<RegimeData | null>(null)
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getPortfolio(), api.getRegime(), api.getMetrics()])
      .then(([p, r, m]) => {
        setPortfolio(p)
        setRegime(r)
        setMetrics(m)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}</div>
  }

  const drawdownPct = portfolio ? portfolio.max_drawdown * 100 : 0
  const circuitBreakerNear = drawdownPct > 7

  return (
    <div>
      <h2 className="text-2xl font-bold font-sans mb-6">Risk Dashboard</h2>

      {/* Risk status cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Drawdown gauge */}
        <div className={`card ${circuitBreakerNear ? 'border-accent-red' : ''}`}>
          <div className="label mb-3">Drawdown</div>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={drawdownPct > 8 ? '#ff1744' : drawdownPct > 5 ? '#ffab00' : '#00e676'}
                  strokeWidth="8"
                  strokeDasharray={`${drawdownPct * 2.51} 251`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-lg">
                {drawdownPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <p className="text-sm text-txt-secondary">Circuit Breaker: 10%</p>
              {circuitBreakerNear && (
                <p className="text-xs text-accent-red font-bold mt-1">WARNING: Near limit</p>
              )}
            </div>
          </div>
        </div>

        {/* Market Regime */}
        <div className="card">
          <div className="label mb-3">Market Regime</div>
          <div className="flex items-center gap-3">
            <RegimeBadge regime={regime?.regime ?? 'sideways'} />
            <div>
              <div className="font-mono font-bold text-lg capitalize">
                {(regime?.regime ?? 'sideways').replace('_', ' ')}
              </div>
              <div className="text-sm text-txt-secondary">
                Confidence: {((regime?.confidence ?? 0.5) * 100).toFixed(0)}%
              </div>
            </div>
          </div>
          {regime?.vix_level != null && (
            <div className="mt-3 text-sm font-mono">
              VIX: <span className={regime.vix_level > 25 ? 'text-accent-red' : 'text-accent-green'}>{regime.vix_level.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Position exposure */}
        <div className="card">
          <div className="label mb-3">Position Exposure</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Open Positions</span>
              <span className="font-mono font-bold">{portfolio?.positions.length ?? 0} / 5</span>
            </div>
            <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-blue rounded-full"
                style={{ width: `${((portfolio?.positions.length ?? 0) / 5) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-3">
              <span>Win Rate</span>
              <span className="font-mono font-bold text-accent-green">
                {metrics ? `${(metrics.win_rate * 100).toFixed(0)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total P&L</span>
              <span className={`font-mono font-bold ${(metrics?.total_pnl ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                ${metrics?.total_pnl.toFixed(0) ?? '0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk rules */}
      <div className="card">
        <h3 className="text-lg font-bold mb-4">Active Risk Rules</h3>
        <div className="grid grid-cols-2 gap-3">
          <RuleItem label="Max Concurrent Positions" value="5" status="active" />
          <RuleItem label="Max Same Sector" value="3" status="active" />
          <RuleItem label="Drawdown Circuit Breaker" value="10%" status={circuitBreakerNear ? 'warning' : 'active'} />
          <RuleItem label="Min Reward/Risk Ratio" value="1.5:1" status="active" />
          <RuleItem label="Daily Loss Limit" value="2%" status="active" />
          <RuleItem label="No Entry Before Close" value="15 min" status="active" />
          <RuleItem label="Max Correlation" value="0.7" status="active" />
          <RuleItem label="Risk Per Trade" value="1%" status="active" />
        </div>
      </div>
    </div>
  )
}

function RegimeBadge({ regime }: { regime: string }) {
  const styles: Record<string, string> = {
    bull_trend: 'bg-accent-green-muted text-accent-green',
    bear_trend: 'bg-accent-red-muted text-accent-red',
    sideways: 'bg-accent-amber-muted text-accent-amber',
    high_vol: 'bg-accent-red-muted text-accent-red',
  }
  const icons: Record<string, string> = {
    bull_trend: '📈',
    bear_trend: '📉',
    sideways: '➡️',
    high_vol: '⚠️',
  }
  return (
    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl ${styles[regime] ?? styles.sideways}`}>
      {icons[regime] ?? '➡️'}
    </div>
  )
}

function RuleItem({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="flex items-center justify-between bg-surface-tertiary rounded-lg px-4 py-2.5">
      <span className="text-sm text-txt-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold">{value}</span>
        <div className={`w-2 h-2 rounded-full ${status === 'warning' ? 'bg-accent-amber' : 'bg-accent-green'}`} />
      </div>
    </div>
  )
}
