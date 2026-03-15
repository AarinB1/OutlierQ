import { useState } from 'react'
import { createBacktest, fetchBacktest } from '../api'
import type { BacktestRun } from '../types'

export default function BacktestPanel() {
  const [strategy, setStrategy] = useState('ensemble')
  const [capital, setCapital] = useState(100000)
  const [run, setRun] = useState<BacktestRun | null>(null)
  const [busy, setBusy] = useState(false)

  const onRun = async () => {
    setBusy(true)
    try {
      const queued = await createBacktest({ strategy_name: strategy, initial_capital: capital })
      const details = await fetchBacktest(queued.id)
      setRun(details)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Backtest Lab</h2>
      <div className="card mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="label mb-1">Strategy</div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
          >
            <option value="ensemble">Ensemble</option>
            <option value="momentum">Momentum</option>
            <option value="mean_reversion">Mean Reversion</option>
            <option value="breakout">Breakout</option>
          </select>
        </div>
        <div>
          <div className="label mb-1">Initial Capital</div>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            className="w-full bg-surface-tertiary border border-border rounded px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={onRun} disabled={busy}>
            {busy ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      <div className="card">
        {run ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="label">Sharpe</div><div>{run.sharpe ?? '-'}</div></div>
            <div><div className="label">Sortino</div><div>{run.sortino ?? '-'}</div></div>
            <div><div className="label">Max Drawdown</div><div>{run.max_drawdown ?? '-'}</div></div>
            <div><div className="label">Trades</div><div>{run.total_trades ?? 0}</div></div>
          </div>
        ) : (
          <div className="text-txt-secondary text-sm">Run a backtest to view metrics.</div>
        )}
      </div>
    </div>
  )
}

