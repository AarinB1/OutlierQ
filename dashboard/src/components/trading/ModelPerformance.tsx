import { useEffect, useState } from 'react'
import { fetchTradingModels } from '../../api'
import type { ModelStatus } from '../../types'

export default function ModelPerformance() {
  const [models, setModels] = useState<ModelStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTradingModels()
      .then(setModels)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="font-mono font-bold text-lg mb-4">Model Performance</h2>
      <div className="card">
        {loading ? (
          <div>Loading...</div>
        ) : models.length === 0 ? (
          <div className="text-txt-secondary text-sm">No model checkpoints yet.</div>
        ) : (
          <div className="space-y-3">
            {models.map((m) => (
              <div key={m.model_name} className="border border-border rounded p-3">
                <div className="font-mono text-sm">{m.model_name} ({m.model_type})</div>
                <div className="text-xs text-txt-secondary">
                  Trained: {m.is_trained ? 'Yes' : 'No'}
                </div>
                <div className="text-xs text-txt-secondary">
                  Val Acc: {m.val_accuracy ?? '-'} | Val Sharpe: {m.val_sharpe ?? '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
