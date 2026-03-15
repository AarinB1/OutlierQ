import { useEffect, useState } from 'react'
import { fetchPortfolio } from '../../api'
import type { PortfolioState } from '../../types'

export default function PortfolioView() {
  const [snapshot, setSnapshot] = useState<PortfolioState | null>(null)

  useEffect(() => {
    fetchPortfolio().then(setSnapshot).catch(() => setSnapshot(null))
  }, [])

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Portfolio</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="card"><div className="label">Cash</div><div>${snapshot?.cash?.toFixed(2) ?? '0.00'}</div></div>
        <div className="card"><div className="label">Total Value</div><div>${snapshot?.total_value?.toFixed(2) ?? '0.00'}</div></div>
        <div className="card"><div className="label">Max Drawdown</div><div>{((snapshot?.max_drawdown ?? 0) * 100).toFixed(2)}%</div></div>
      </div>
      <div className="card">
        <div className="label mb-2">Open Positions</div>
        {snapshot?.positions?.length ? (
          <pre className="text-xs text-txt-secondary overflow-auto">{JSON.stringify(snapshot.positions, null, 2)}</pre>
        ) : (
          <div className="text-sm text-txt-secondary">No open positions.</div>
        )}
      </div>
    </div>
  )
}
