import { useEffect, useMemo, useState } from 'react'
import {
  fetchTradingModelsEnhanced,
  fetchModelHistory,
  triggerModelTrain,
} from '../../api'
import type {
  ModelCheckpointEnhanced,
  ModelTrainResult,
  ModelVersionHistoryEntry,
} from '../../types'
import { useToast } from '../../hooks/useToast'

type TrainStatus = 'idle' | 'running'

export default function ModelPerformance() {
  const { addToast } = useToast()

  const [models, setModels] = useState<ModelCheckpointEnhanced[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [history, setHistory] = useState<ModelVersionHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [trainStatus, setTrainStatus] = useState<TrainStatus>('idle')
  const [trainResult, setTrainResult] = useState<ModelTrainResult | null>(null)
  const [trainModelType, setTrainModelType] = useState<string>('all')
  const [trainTicker, setTrainTicker] = useState<string>('SPY')
  const [trainPeriod, setTrainPeriod] = useState<string>('2y')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetchTradingModelsEnhanced()
        setModels(res)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load models'
        addToast('error', 'Models error', msg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [addToast])

  const onSelectModel = async (modelName: string) => {
    setSelectedModel(modelName)
    setHistory([])
    setHistoryLoading(true)
    try {
      const res = await fetchModelHistory(modelName)
      setHistory(res)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load model history'
      addToast('error', 'Model history error', msg)
    } finally {
      setHistoryLoading(false)
    }
  }

  const onTrain = async () => {
    if (trainStatus === 'running') return
    setTrainStatus('running')
    setTrainResult(null)
    addToast('info', 'Training started', `Training ${trainModelType} on ${trainTicker} (${trainPeriod})`)
    try {
      const res = await triggerModelTrain({
        model_type: trainModelType,
        ticker: trainTicker.toUpperCase(),
        period: trainPeriod,
      })
      setTrainResult(res)
      if (res.status === 'completed') {
        addToast('trade', 'Training complete', `Model training (${res.model_type}) finished`)
        // refresh models list
        const updated = await fetchTradingModelsEnhanced()
        setModels(updated)
      } else {
        addToast('error', 'Training failed', res.error ?? 'Model training failed')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to trigger training'
      addToast('error', 'Training error', msg)
    } finally {
      setTrainStatus('idle')
    }
  }

  const sortedModels = useMemo(
    () =>
      [...models].sort((a, b) => {
        const aName = a.model_name.toLowerCase()
        const bName = b.model_name.toLowerCase()
        if (aName === bName) return 0
        return aName < bName ? -1 : 1
      }),
    [models],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg">Model Performance</h2>
        {models.length > 0 && (
          <span className="text-xs text-txt-secondary">{models.length} models</span>
        )}
      </div>

      {/* Training controls */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label mb-1">Train Models</div>
            <div className="text-xs text-txt-secondary">
              Launch background training jobs for your trading models.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="space-y-1">
            <label className="label text-[11px]">Model type</label>
            <select
              value={trainModelType}
              onChange={(e) => setTrainModelType(e.target.value)}
              className="w-full bg-bg-base border border-border rounded px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="lstm">LSTM</option>
              <option value="transformer">Transformer</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="label text-[11px]">Ticker</label>
            <input
              value={trainTicker}
              onChange={(e) => setTrainTicker(e.target.value.toUpperCase())}
              className="w-full bg-bg-base border border-border rounded px-2 py-1 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="label text-[11px]">Lookback</label>
            <select
              value={trainPeriod}
              onChange={(e) => setTrainPeriod(e.target.value)}
              className="w-full bg-bg-base border border-border rounded px-2 py-1 text-xs"
            >
              <option value="1y">1 year</option>
              <option value="2y">2 years</option>
              <option value="3y">3 years</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={onTrain}
              disabled={trainStatus === 'running'}
              className="btn-primary w-full text-xs"
            >
              {trainStatus === 'running' ? 'Training…' : 'Start training'}
            </button>
          </div>
        </div>
        {trainResult && (
          <div className="mt-3 text-[11px] text-txt-secondary">
            Last run: status <span className="font-mono">{trainResult.status}</span> (
            <span className="font-mono">{trainResult.model_type}</span>)
          </div>
        )}
      </div>

      {/* Model cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          {loading ? (
            <div className="text-sm text-txt-secondary">Loading models…</div>
          ) : sortedModels.length === 0 ? (
            <div className="text-sm text-txt-secondary">No model checkpoints yet.</div>
          ) : (
            <div className="space-y-3">
              {sortedModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectModel(m.model_name)}
                  className={`w-full text-left border rounded p-3 transition-colors ${
                    selectedModel === m.model_name
                      ? 'border-accent-blue bg-bg-subtle'
                      : 'border-border hover:border-accent-blue/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-mono text-sm truncate">
                      {m.model_name} <span className="text-xs text-txt-secondary">({m.model_type})</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full ${
                          m.is_trained ? 'bg-accent-green/10 text-accent-green' : 'bg-border text-txt-secondary'
                        }`}
                      >
                        {m.is_trained ? 'Trained' : 'Untrained'}
                      </span>
                      <span className="text-txt-secondary">
                        v{m.version} ·{' '}
                        {m.trained_at ? new Date(m.trained_at).toLocaleDateString() : 'never'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-txt-secondary mb-2">
                    <div>
                      Val Acc:{' '}
                      <span className="font-mono">
                        {m.val_accuracy != null ? (m.val_accuracy * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </div>
                    <div>
                      Val Sharpe:{' '}
                      <span className="font-mono">
                        {m.val_sharpe != null ? m.val_sharpe.toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                  {m.feature_names && m.feature_names.length > 0 && (
                    <div className="text-[11px] text-txt-secondary truncate">
                      Features:{' '}
                      <span className="font-mono">
                        {m.feature_names.slice(0, 6).join(', ')}
                        {m.feature_names.length > 6 ? '…' : ''}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Version history */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div className="label">Version History</div>
            <span className="text-[10px] text-txt-secondary">
              {selectedModel ? selectedModel : 'Select a model'}
            </span>
          </div>
          {historyLoading ? (
            <div className="text-xs text-txt-secondary">Loading history…</div>
          ) : !selectedModel ? (
            <div className="text-xs text-txt-secondary">Select a model to view history.</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-txt-secondary">No history for this model yet.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="border border-border/60 rounded px-2 py-1.5 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono">v{h.version}</span>
                    <span className="text-txt-secondary">
                      {h.trained_at ? new Date(h.trained_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-txt-secondary">
                    <span>
                      Acc:{' '}
                      <span className="font-mono">
                        {h.val_accuracy != null ? (h.val_accuracy * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </span>
                    <span>
                      Sharpe:{' '}
                      <span className="font-mono">
                        {h.val_sharpe != null ? h.val_sharpe.toFixed(2) : '—'}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
