import { useEffect, useState } from 'react'
import type { ModelInfo } from '../types'
import { api } from '../api'

export default function ModelPerformance() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getModels()
      .then(setModels)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}</div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold font-sans mb-6">Model Performance</h2>

      {models.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-txt-secondary text-lg mb-2">No trained models yet</p>
          <p className="text-txt-tertiary text-sm">Train models via CLI: <code className="font-mono bg-surface-tertiary px-2 py-0.5 rounded">python scripts/run_ingestion.py --train-trading</code></p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Comparison table */}
          <div className="card">
            <h3 className="text-lg font-bold mb-4">Model Comparison</h3>
            <table className="w-full text-sm font-mono">
              <thead className="text-txt-tertiary text-xs uppercase">
                <tr>
                  <th className="text-left py-2 px-3">Model</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-center py-2 px-3">Version</th>
                  <th className="text-right py-2 px-3">Val Accuracy</th>
                  <th className="text-right py-2 px-3">Val Sharpe</th>
                  <th className="text-left py-2 px-3">Trained</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id} className="border-t border-border hover:bg-surface-tertiary/50">
                    <td className="py-2 px-3 font-bold">{m.model_name}</td>
                    <td className="py-2 px-3">
                      <span className="pill bg-accent-purple-muted text-accent-purple">{m.model_type}</span>
                    </td>
                    <td className="text-center py-2 px-3">v{m.version}</td>
                    <td className="text-right py-2 px-3">
                      {m.val_accuracy != null ? `${(m.val_accuracy * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="text-right py-2 px-3">
                      {m.val_sharpe != null ? m.val_sharpe.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-3 text-txt-tertiary">
                      {m.trained_at ? new Date(m.trained_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hyperparameters */}
          {models.filter((m) => m.hyperparameters).length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4">Hyperparameters</h3>
              <div className="grid grid-cols-2 gap-4">
                {models
                  .filter((m) => m.hyperparameters)
                  .map((m) => (
                    <div key={m.id} className="bg-surface-tertiary rounded-lg p-4">
                      <div className="font-mono font-bold text-sm mb-2">{m.model_name}</div>
                      <pre className="text-xs text-txt-secondary font-mono overflow-auto">
                        {JSON.stringify(m.hyperparameters, null, 2)}
                      </pre>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
