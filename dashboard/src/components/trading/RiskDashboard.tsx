import { useEffect, useState } from 'react'
import { fetchMarketRegime, fetchTradingMetrics } from '../../api'
import type { MarketRegime } from '../../types'

interface TradingMetrics {
  max_drawdown?: number
  sharpe?: number
}

export default function RiskDashboard() {
  const [regime, setRegime] = useState<MarketRegime | null>(null)
  const [metrics, setMetrics] = useState<TradingMetrics | null>(null)

  useEffect(() => {
    fetchMarketRegime().then(setRegime).catch(() => setRegime(null))
    fetchTradingMetrics().then(setMetrics).catch(() => setMetrics(null))
  }, [])

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Risk Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="label mb-2">Market Regime</div>
          <div className="text-xl font-mono">{regime?.regime ?? 'sideways'}</div>
          <div className="text-xs text-txt-secondary">Confidence {(((regime?.confidence ?? 0) * 100)).toFixed(0)}%</div>
        </div>
        <div className="card">
          <div className="label mb-2">Drawdown</div>
          <div className="text-xl font-mono">{((metrics?.max_drawdown ?? 0) * 100).toFixed(2)}%</div>
          <div className="text-xs text-txt-secondary">Sharpe {metrics?.sharpe ?? '-'}</div>
        </div>
      </div>
    </div>
  )
}
