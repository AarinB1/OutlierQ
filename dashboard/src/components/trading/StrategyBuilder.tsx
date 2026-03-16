import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  deleteStrategyConfig,
  fetchStrategyConfigs,
  fetchStrategyDefaults,
  runBacktest,
  saveStrategyConfig,
} from '../../api'
import type { BacktestFullResult, StrategyConfigSaved, StrategyDefaults } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

type StrategyKey = 'momentum' | 'mean_reversion' | 'breakout'
type RegimeKey = 'bull_trend' | 'bear_trend' | 'sideways' | 'high_vol'

interface SliderConfig {
  key: string
  label: string
  min: number
  max: number
  step: number
}

const MOMENTUM_SLIDERS: SliderConfig[] = [
  { key: 'rsi_low', label: 'RSI Low', min: 20, max: 50, step: 1 },
  { key: 'rsi_high', label: 'RSI High', min: 50, max: 80, step: 1 },
  { key: 'adx_threshold', label: 'ADX Threshold', min: 15, max: 40, step: 1 },
  { key: 'volume_threshold', label: 'Volume Threshold', min: 1, max: 3, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1, max: 4, step: 0.1 },
  { key: 'atr_target_multiplier', label: 'ATR Target Multiplier', min: 1, max: 6, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

const MEAN_REVERSION_SLIDERS: SliderConfig[] = [
  { key: 'rsi2_buy_threshold', label: 'RSI(2) Buy Threshold', min: 5, max: 20, step: 1 },
  { key: 'rsi2_short_threshold', label: 'RSI(2) Short Threshold', min: 80, max: 95, step: 1 },
  { key: 'vwap_deviation_threshold', label: 'VWAP Deviation Threshold', min: 0.5, max: 3, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1, max: 3, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

const BREAKOUT_SLIDERS: SliderConfig[] = [
  { key: 'lookback', label: 'Lookback Period', min: 10, max: 50, step: 1 },
  { key: 'volume_multiplier', label: 'Volume Multiplier', min: 1, max: 4, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1, max: 4, step: 0.1 },
  { key: 'atr_target_multiplier', label: 'ATR Target Multiplier', min: 1, max: 6, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

const STRATEGY_META: Record<
  StrategyKey,
  { label: string; description: string; sliders: SliderConfig[] }
> = {
  momentum: {
    label: 'Momentum',
    description: 'Trend-following with RSI, ADX, and volume confirmation.',
    sliders: MOMENTUM_SLIDERS,
  },
  mean_reversion: {
    label: 'Mean Reversion',
    description: 'Fade stretched moves back toward VWAP and local mean.',
    sliders: MEAN_REVERSION_SLIDERS,
  },
  breakout: {
    label: 'Breakout',
    description: 'Trade range breaks when volume and volatility expand.',
    sliders: BREAKOUT_SLIDERS,
  },
}

const formatValue = (value: number, step: number) => (step >= 1 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, ''))

export default function StrategyBuilder() {
  const { addToast } = useToast()
  const [defaults, setDefaults] = useState<StrategyDefaults | null>(null)
  const [configs, setConfigs] = useState<StrategyConfigSaved[]>([])
  const [loading, setLoading] = useState(true)
  const [regime, setRegime] = useState<RegimeKey>('bull_trend')
  const [ticker, setTicker] = useState('SPY')
  const [capital, setCapital] = useState(100000)
  const [selectedConfigId, setSelectedConfigId] = useState('new')
  const [configName, setConfigName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [panelOpen, setPanelOpen] = useState<Record<StrategyKey, boolean>>({
    momentum: true,
    mean_reversion: true,
    breakout: true,
  })
  const [enabled, setEnabled] = useState<Record<StrategyKey, boolean>>({
    momentum: true,
    mean_reversion: true,
    breakout: false,
  })
  const [momentumParams, setMomentumParams] = useState<Record<string, number>>({})
  const [meanReversionParams, setMeanReversionParams] = useState<Record<string, number>>({})
  const [breakoutParams, setBreakoutParams] = useState<Record<string, number>>({})
  const [backtestResult, setBacktestResult] = useState<BacktestFullResult | null>(null)
  const [backtesting, setBacktesting] = useState(false)

  const applyDefaults = (nextDefaults: StrategyDefaults) => {
    setMomentumParams(nextDefaults.momentum)
    setMeanReversionParams(nextDefaults.mean_reversion)
    setBreakoutParams(nextDefaults.breakout)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [nextDefaults, nextConfigs] = await Promise.all([
          fetchStrategyDefaults(),
          fetchStrategyConfigs(),
        ])
        setDefaults(nextDefaults)
        setConfigs(nextConfigs)
        applyDefaults(nextDefaults)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load strategy builder'
        addToast('error', 'Strategy builder error', message)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [addToast])

  const enabledCount = Object.values(enabled).filter(Boolean).length

  const resetToNew = () => {
    if (defaults) {
      applyDefaults(defaults)
    }
    setSelectedConfigId('new')
    setConfigName('')
    setShowSaveInput(false)
    setRegime('bull_trend')
    setEnabled({ momentum: true, mean_reversion: true, breakout: false })
    setBacktestResult(null)
  }

  const applySavedConfig = (config: StrategyConfigSaved) => {
    if (!defaults) return
    const params = config.params ?? {}
    setSelectedConfigId(config.id)
    setConfigName(config.name)
    setRegime((config.regime as RegimeKey | null) ?? 'bull_trend')
    setEnabled({
      momentum: config.toggles?.momentum ?? true,
      mean_reversion: config.toggles?.mean_reversion ?? true,
      breakout: config.toggles?.breakout ?? false,
    })
    setMomentumParams({ ...defaults.momentum, ...params })
    setMeanReversionParams({ ...defaults.mean_reversion, ...params })
    setBreakoutParams({ ...defaults.breakout, ...params })
  }

  const handleConfigSelect = (value: string) => {
    if (value === 'new') {
      resetToNew()
      return
    }
    const config = configs.find((item) => item.id === value)
    if (config) {
      applySavedConfig(config)
    }
  }

  const toggleStrategy = (key: StrategyKey) => {
    setEnabled((prev) => {
      const nextEnabled = !prev[key]
      if (nextEnabled) {
        setPanelOpen((panels) => ({ ...panels, [key]: true }))
      }
      return { ...prev, [key]: nextEnabled }
    })
  }

  const updateParams = (
    key: StrategyKey,
    setter: Dispatch<SetStateAction<Record<string, number>>>,
    field: string,
    value: number,
  ) => {
    setter((prev) => ({ ...prev, [field]: value }))
    if (!enabled[key]) {
      setEnabled((prev) => ({ ...prev, [key]: true }))
    }
  }

  const combinedParams = useMemo(
    () => ({
      ...(enabled.momentum ? momentumParams : {}),
      ...(enabled.mean_reversion ? meanReversionParams : {}),
      ...(enabled.breakout ? breakoutParams : {}),
    }),
    [enabled, momentumParams, meanReversionParams, breakoutParams],
  )

  const strategyParams = useMemo(
    () => ({
      momentum: momentumParams,
      mean_reversion: meanReversionParams,
      breakout: breakoutParams,
    }),
    [momentumParams, meanReversionParams, breakoutParams],
  )

  const summary = useMemo(() => {
    const parts: string[] = []
    if (enabled.momentum) {
      parts.push(
        `Momentum (RSI ${formatValue(momentumParams.rsi_low ?? 40, 1)}-${formatValue(momentumParams.rsi_high ?? 70, 1)}, ADX > ${formatValue(momentumParams.adx_threshold ?? 25, 1)}, Volume > ${formatValue(momentumParams.volume_threshold ?? 1.5, 0.1)}x, target ${formatValue(momentumParams.atr_target_multiplier ?? 3, 0.1)}x ATR with ${formatValue(momentumParams.atr_stop_multiplier ?? 2, 0.1)}x ATR stop)`,
      )
    }
    if (enabled.mean_reversion) {
      parts.push(
        `Mean Reversion (RSI(2) < ${formatValue(meanReversionParams.rsi2_buy_threshold ?? 10, 1)}, RSI(2) short > ${formatValue(meanReversionParams.rsi2_short_threshold ?? 90, 1)}, VWAP deviation > ${formatValue(meanReversionParams.vwap_deviation_threshold ?? 1.5, 0.1)}%, ${formatValue(meanReversionParams.atr_stop_multiplier ?? 1.5, 0.1)}x ATR stop)`,
      )
    }
    if (enabled.breakout) {
      parts.push(
        `Breakout (lookback ${formatValue(breakoutParams.lookback ?? 20, 1)}, volume > ${formatValue(breakoutParams.volume_multiplier ?? 2, 0.1)}x, target ${formatValue(breakoutParams.atr_target_multiplier ?? 3, 0.1)}x ATR with ${formatValue(breakoutParams.atr_stop_multiplier ?? 2, 0.1)}x ATR stop)`,
      )
    }
    if (parts.length === 0) {
      return 'No strategies enabled. Enable at least one strategy to build an ensemble.'
    }
    const threshold =
      breakoutParams.min_confidence ??
      meanReversionParams.min_confidence ??
      momentumParams.min_confidence ??
      0.5
    return `When market regime is ${labelForRegime(regime)}, use ${parts.join(' combined with ')}. Min confidence threshold: ${formatValue(threshold, 0.05)}.`
  }, [enabled, regime, momentumParams, meanReversionParams, breakoutParams])

  const handleSave = async () => {
    const finalName = (configName || configs.find((item) => item.id === selectedConfigId)?.name || '').trim()
    if (!finalName) {
      addToast('error', 'Config name required', 'Enter a name before saving.')
      return
    }
    try {
      const saved = await saveStrategyConfig({
        name: finalName,
        strategy_name: 'ensemble',
        regime,
        toggles: enabled,
        params: combinedParams,
      })
      const nextConfigs = await fetchStrategyConfigs()
      setConfigs(nextConfigs)
      const matched = nextConfigs.find((item) => item.id === saved.id)
      if (matched) {
        applySavedConfig(matched)
      } else {
        setSelectedConfigId(saved.id)
      }
      setShowSaveInput(false)
      addToast('trade', `Config ${saved.status}`, finalName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration'
      addToast('error', 'Save failed', message)
    }
  }

  const handleDelete = async () => {
    if (selectedConfigId === 'new') return
    try {
      await deleteStrategyConfig(selectedConfigId)
      const nextConfigs = await fetchStrategyConfigs()
      setConfigs(nextConfigs)
      resetToNew()
      addToast('info', 'Configuration deleted', 'Saved strategy preset removed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete configuration'
      addToast('error', 'Delete failed', message)
    }
  }

  const handleQuickBacktest = async () => {
    setBacktesting(true)
    setBacktestResult(null)
    addToast('info', 'Backtest started', `Running ensemble backtest on ${ticker.toUpperCase()}...`)
    try {
      const result = await runBacktest({
        strategy_name: 'ensemble',
        ticker,
        initial_capital: capital,
        regime,
        toggles: enabled,
        params: combinedParams,
        strategy_params: strategyParams,
      })
      setBacktestResult(result)
      addToast(
        'trade',
        'Backtest complete',
        `Sharpe ${result.metrics.sharpe_ratio.toFixed(2)} • Return ${result.metrics.total_return_pct.toFixed(1)}%`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run backtest'
      addToast('error', 'Backtest failed', message)
    } finally {
      setBacktesting(false)
    }
  }

  if (loading || !defaults) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold text-lg">Strategy Builder</h2>
        </div>
        <div className="card space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton h-10 w-full rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-mono font-bold text-lg">Strategy Builder</h2>
          {configs.length === 0 && (
            <p className="text-xs text-txt-tertiary mt-1">
              No saved configurations. Adjust parameters and click Save to create your first strategy preset.
            </p>
          )}
        </div>
        <div className="card p-4 flex flex-col md:flex-row md:items-center gap-3">
          <label className="flex flex-col gap-1">
            <span className="label">Load Config</span>
            <select
              value={selectedConfigId}
              onChange={(e) => handleConfigSelect(e.target.value)}
              className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm min-w-[220px]"
            >
              <option value="new">New</option>
              {configs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="btn-primary text-xs px-4 py-2" onClick={() => setShowSaveInput((prev) => !prev)}>
              Save
            </button>
            <button
              className="px-3 py-2 rounded-lg border border-border text-txt-secondary hover:text-accent-red disabled:opacity-50"
              onClick={handleDelete}
              disabled={selectedConfigId === 'new'}
              aria-label="Delete configuration"
            >
              ✕
            </button>
          </div>
          {showSaveInput && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="label">Config Name</span>
                <input
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm"
                  placeholder="Bull trend preset"
                />
              </label>
              <button className="btn-primary text-xs px-4 py-2" onClick={handleSave}>
                Save Now
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="label">Regime</span>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value as RegimeKey)}
              className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm"
            >
              <option value="bull_trend">Bull</option>
              <option value="bear_trend">Bear</option>
              <option value="sideways">Sideways</option>
              <option value="high_vol">High Vol</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(STRATEGY_META) as StrategyKey[]).map((key) => {
            const meta = STRATEGY_META[key]
            const isEnabled = enabled[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleStrategy(key)}
                className={`card p-4 text-left transition border-l-4 ${
                  isEnabled ? 'border-l-accent-blue bg-surface-primary' : 'border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold text-sm">{meta.label}</div>
                    <div className="text-xs text-txt-secondary mt-1">{meta.description}</div>
                  </div>
                  <span className={`pill text-[10px] ${isEnabled ? 'bg-accent-blue/15 text-accent-blue' : 'bg-surface-tertiary text-txt-tertiary'}`}>
                    {isEnabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input type="checkbox" checked={isEnabled} readOnly />
                  <span className="text-xs text-txt-secondary">Include in ensemble</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {(Object.keys(STRATEGY_META) as StrategyKey[]).map((key) => {
        if (!enabled[key]) return null
        const meta = STRATEGY_META[key]
        const params =
          key === 'momentum'
            ? momentumParams
            : key === 'mean_reversion'
            ? meanReversionParams
            : breakoutParams
        const setter =
          key === 'momentum'
            ? setMomentumParams
            : key === 'mean_reversion'
            ? setMeanReversionParams
            : setBreakoutParams
        return (
          <div key={key} className="card">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setPanelOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              <h3 className="font-mono font-semibold text-sm">{meta.label} Parameters</h3>
              <span className="text-txt-secondary">{panelOpen[key] ? '−' : '+'}</span>
            </button>
            {panelOpen[key] && (
              <div className="mt-4 space-y-4">
                {meta.sliders.map((slider) => (
                  <div key={slider.key} className="grid grid-cols-[160px_1fr_64px] gap-4 items-center">
                    <span className="label normal-case tracking-normal text-xs">{slider.label}</span>
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={params[slider.key] ?? 0}
                      onChange={(e) => updateParams(key, setter, slider.key, Number(e.target.value))}
                      className="w-full accent-accent-blue"
                    />
                    <span className="font-mono text-sm text-right">
                      {formatValue(params[slider.key] ?? 0, slider.step)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="card">
        <h3 className="font-mono font-semibold text-sm mb-3">Strategy Summary</h3>
        <p className="font-sans text-sm text-txt-secondary">{summary}</p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label">Ticker</span>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="bg-surface-tertiary border border-border rounded px-3 py-2 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Capital</span>
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="bg-surface-tertiary border border-border rounded px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <button
              className="btn-primary w-full disabled:opacity-50"
              disabled={enabledCount === 0 || backtesting}
              title={enabledCount === 0 ? 'Enable at least one strategy' : ''}
              onClick={handleQuickBacktest}
            >
              {backtesting ? 'Running...' : 'Quick Backtest'}
            </button>
          </div>
        </div>

        {backtestResult ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Sharpe" value={backtestResult.metrics.sharpe_ratio.toFixed(2)} />
            <MiniStat label="Return %" value={backtestResult.metrics.total_return_pct.toFixed(1)} />
            <MiniStat label="Trades" value={String(backtestResult.metrics.total_trades)} />
            <MiniStat label="Max Drawdown" value={`${backtestResult.metrics.max_drawdown_pct.toFixed(1)}%`} />
          </div>
        ) : enabledCount === 0 ? (
          <EmptyState
            icon="◇"
            title="No strategies enabled"
            subtitle="Enable at least one strategy to run a quick backtest."
          />
        ) : null}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="label mb-1">{label}</div>
      <div className="font-mono font-bold text-lg">{value}</div>
    </div>
  )
}

function labelForRegime(regime: RegimeKey) {
  switch (regime) {
    case 'bull_trend':
      return 'Bull'
    case 'bear_trend':
      return 'Bear'
    case 'high_vol':
      return 'High Vol'
    case 'sideways':
    default:
      return 'Sideways'
  }
}
