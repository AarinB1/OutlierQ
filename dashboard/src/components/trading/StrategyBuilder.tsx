import { useState } from 'react'
import { runBacktest } from '../../api'

export default function StrategyBuilder() {
  const [regime, setRegime] = useState('bull_trend')
  const [enableMomentum, setEnableMomentum] = useState(true)
  const [enableMeanReversion, setEnableMeanReversion] = useState(true)
  const [resultId, setResultId] = useState<string | null>(null)

  const runQuickBacktest = async () => {
    const payload = {
      strategy_name: 'ensemble',
      regime,
      toggles: {
        momentum: enableMomentum,
        mean_reversion: enableMeanReversion,
      },
    }
    const out = await runBacktest(payload)
    setResultId(typeof out?.id === 'string' ? out.id : null)
  }

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Strategy Builder</h2>
      <div className="card space-y-4">
        <div>
          <div className="label mb-1">Regime</div>
          <select value={regime} onChange={(e) => setRegime(e.target.value)} className="bg-surface-tertiary border border-border rounded px-3 py-2">
            <option value="bull_trend">Bull</option>
            <option value="bear_trend">Bear</option>
            <option value="sideways">Sideways</option>
            <option value="high_vol">High Vol</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enableMomentum} onChange={(e) => setEnableMomentum(e.target.checked)} />
          Enable Momentum
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enableMeanReversion} onChange={(e) => setEnableMeanReversion(e.target.checked)} />
          Enable Mean Reversion
        </label>
        <button className="btn-primary" onClick={runQuickBacktest}>Quick Backtest</button>
        {resultId && <div className="text-xs text-txt-secondary">Queued backtest run: {resultId}</div>}
      </div>
    </div>
  )
}
