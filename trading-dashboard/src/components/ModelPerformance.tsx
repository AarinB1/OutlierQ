import { useEffect, useMemo, useState } from 'react'
import { fetchModels, fetchModelHistory, triggerModelTrain } from '../api'
import type { ModelCheckpoint, ModelTrainResult, ModelVersionHistoryEntry } from '../types'
import { useToast } from '../hooks/useToast'

type CardTrainState = 'idle' | 'running'

const formatAcc = (acc: number | null | undefined): { text: string; color: string } => {
  if (acc == null) return { text: '—', color: 'text-txt-secondary' }
  const raw = acc ?? 0
  const pct = raw > 1 ? raw : raw * 100
  let color = 'text-accent-red'
  if (pct > 60) color = 'text-accent-green'
  else if (pct >= 40) color = 'text-accent-amber'
  return { text: `${pct.toFixed(1)}%`, color }
}

const formatSharpe = (s: number | null | undefined): { text: string; color: string } => {
  if (s == null) return { text: '—', color: 'text-txt-secondary' }
  let color = 'text-accent-red'
  if (s > 1) color = 'text-accent-green'
  else if (s >= 0) color = 'text-accent-amber'
  return { text: s.toFixed(2), color }
}

const isStale = (trainedAt: string | null): boolean => {
  if (!trainedAt) return false
  const t = new Date(trainedAt).getTime()
  if (!Number.isFinite(t)) return false
  const days = (Date.now() - t) / (1000 * 60 * 60 * 24)
  return days > 7
}

const trainingLabel = (trainedAt: string | null) => {
  if (!trainedAt) return 'Trained: No'
  const t = new Date(trainedAt)
  const diffDays = (Date.now() - t.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays < 1) return 'Trained today'
  if (diffDays < 7) return `Trained ${Math.round(diffDays)} days ago`
  return `Trained on ${t.toLocaleDateString()}`
}

export default function ModelPerformance() {
  const { addToast } = useToast()

  const [models, setModels] = useState<ModelCheckpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [history, setHistory] = useState<Record<string, ModelVersionHistoryEntry[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({})
  const [trainState, setTrainState] = useState<Record<string, CardTrainState>>({})

  const loadModels = async () => {
    setLoading(true)
    try {
      const res = await fetchModels()
      setModels(res)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load models'
      addToast('error', 'Models error', msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadModels()
  }, [])

  const sortedModels = useMemo(
    () =>
      [...models].sort((a, b) => a.model_name.localeCompare(b.model_name)),
    [models],
  )

  const handleToggleDetails = async (model: ModelCheckpoint) => {
    const key = model.model_name
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
    if (!history[key] && !historyLoading[key]) {
      setHistoryLoading((prev) => ({ ...prev, [key]: true }))
      try {
        const h = await fetchModelHistory(model.model_name)
        setHistory((prev) => ({ ...prev, [key]: h }))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch model history'
        addToast('error', 'Model history error', msg)
      } finally {
        setHistoryLoading((prev) => ({ ...prev, [key]: false }))
      }
    }
  }

  const handleTrain = async (model: ModelCheckpoint) => {
    const key = model.id
    if (trainState[key] === 'running') return
    setTrainState((prev) => ({ ...prev, [key]: 'running' }))
    try {
      const res: ModelTrainResult = await triggerModelTrain(model.model_type, 'SPY')
      if (res.status === 'completed') {
        addToast(
          'trade',
          'Training complete',
          `${model.model_name} v${model.version} trained successfully`,
        )
        await loadModels()
      } else {
        addToast('error', 'Training failed', res.error ?? 'Model training failed')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to trigger model training'
      addToast('error', 'Training error', msg)
    } finally {
      setTrainState((prev) => ({ ...prev, [key]: 'idle' }))
    }
  }

  const renderStatus = (model: ModelCheckpoint) => {
    const trained = !!model.is_trained
    const stale = isStale(model.trained_at) && trained
    if (!trained) {
      return (
        <div className="flex items-center gap-1 text-xs text-accent-red">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-red" />
          <span>Untrained</span>
        </div>
      )
    }
    if (stale) {
      return (
        <div className="flex items-center gap-1 text-xs text-accent-amber">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-amber" />
          <span>Stale</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1 text-xs text-accent-green">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
        <span>Trained</span>
      </div>
    )
  }

  const renderTrainButton = (model: ModelCheckpoint) => {
    const key = model.id
    const running = trainState[key] === 'running'
    const stale = isStale(model.trained_at) && model.is_trained
    const label = !model.is_trained || stale ? 'Train Model' : 'Retrain'
    const baseClasses =
      !model.is_trained || stale
        ? 'btn-primary w-full text-xs'
        : 'w-full text-xs border border-border rounded px-3 py-1.5 text-txt-secondary hover:text-txt-primary bg-transparent'

    return (
      <button
        type="button"
        onClick={() => void handleTrain(model)}
        disabled={running}
        className={baseClasses}
      >
        {running ? 'Training…' : label}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg">Model Performance</h2>
        {sortedModels.length > 0 && (
          <span className="pill bg-surface-tertiary text-[11px] text-txt-secondary">
            {sortedModels.length} models
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-3 w-12" />
              </div>
              <div className="skeleton h-4 w-20" />
              <div className="grid grid-cols-2 gap-2">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-8 w-full" />
            </div>
          ))}
        </div>
      ) : sortedModels.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center py-10">
          <div className="text-sm text-txt-secondary mb-2">
            No model checkpoints registered.
          </div>
          <div className="text-xs text-txt-tertiary">
            Models are created when the training pipeline runs. Use{' '}
            <span className="font-mono text-[11px]">--train-trading</span> to train models.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedModels.map((m) => {
            const acc = formatAcc(m.val_accuracy)
            const sharpe = formatSharpe(m.val_sharpe)
            const key = m.model_name
            const showDetails = expanded[key]
            const cardTrainState = trainState[m.id] ?? 'idle'

            return (
              <div key={m.id} className="card flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono font-bold text-lg truncate">
                        {m.model_name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="pill bg-surface-tertiary text-[10px] text-txt-tertiary uppercase">
                          {m.model_type}
                        </span>
                        <span className="text-[10px] text-txt-tertiary font-mono">
                          v{m.version}
                        </span>
                      </div>
                    </div>
                    {renderStatus(m)}
                  </div>

                  {m.val_accuracy != null || m.val_sharpe != null ? (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="rounded-md bg-surface-tertiary px-2 py-1.5">
                        <div className="text-[10px] text-txt-tertiary">Val Accuracy</div>
                        <div className={`font-mono text-sm ${acc.color}`}>{acc.text}</div>
                      </div>
                      <div className="rounded-md bg-surface-tertiary px-2 py-1.5">
                        <div className="text-[10px] text-txt-tertiary">Val Sharpe</div>
                        <div className={`font-mono text-sm ${sharpe.color}`}>
                          {sharpe.text}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-txt-tertiary italic">
                      No metrics yet — train this model to see performance.
                    </div>
                  )}

                  <div className="text-[11px] text-txt-tertiary">
                    {trainingLabel(m.trained_at)}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleDetails(m)}
                    className="mt-1 text-[11px] text-accent-blue hover:underline"
                  >
                    {showDetails ? 'Hide details' : 'Details'}
                  </button>

                  {showDetails && (
                    <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                      <div className="text-[11px] text-txt-secondary">
                        <span className="font-semibold">Hyperparameters:</span>{' '}
                        {m.hyperparameters
                          ? Object.entries(m.hyperparameters).length > 0
                            ? (
                                Object.entries(m.hyperparameters) as [string, unknown][]
                              ).map(([k, v]) => `${k}: ${String(v)}`).join(', ')
                            : 'Default hyperparameters'
                          : 'Default hyperparameters'}
                      </div>
                      <div className="text-[11px] text-txt-secondary">
                        {m.feature_names && m.feature_names.length > 0
                          ? `${m.feature_names.length} features`
                          : 'Feature metadata unavailable'}
                      </div>
                      {historyLoading[key] ? (
                        <div className="text-[11px] text-txt-secondary">Loading history…</div>
                      ) : history[key] && history[key].length > 0 ? (
                        <div className="space-y-1 text-[10px] text-txt-secondary">
                          {history[key].slice(0, 3).map((h) => {
                            const hAcc = formatAcc(h.val_accuracy)
                            const hSharpe = formatSharpe(h.val_sharpe)
                            return (
                              <div
                                key={h.id}
                                className="flex items-center justify-between gap-3"
                              >
                                <span className="font-mono">v{h.version}</span>
                                <span className={hAcc.color}>{hAcc.text}</span>
                                <span className={hSharpe.color}>{hSharpe.text}</span>
                                <span>
                                  {h.trained_at
                                    ? new Date(h.trained_at).toLocaleDateString()
                                    : '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  {renderTrainButton(m)}
                  {cardTrainState === 'running' && (
                    <div className="mt-1 text-[10px] text-txt-secondary">
                      Training in progress…
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
