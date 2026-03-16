import { useState, useEffect, useCallback } from 'react'
import { runBacktest, fetchStrategyDefaults, fetchStrategyConfigs, saveStrategyConfig, deleteStrategyConfig } from '../api'
import type { StrategyDefaults, StrategyConfigSaved } from '../types'
import { useToast } from '../hooks/useToast'

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
  { key: 'volume_threshold', label: 'Volume Threshold', min: 1.0, max: 3.0, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1.0, max: 4.0, step: 0.1 },
  { key: 'atr_target_multiplier', label: 'ATR Target Multiplier', min: 1.0, max: 6.0, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

const MEAN_REVERSION_SLIDERS: SliderConfig[] = [
  { key: 'rsi2_buy_threshold', label: 'RSI(2) Buy Threshold', min: 5, max: 20, step: 1 },
  { key: 'rsi2_short_threshold', label: 'RSI(2) Short Threshold', min: 80, max: 95, step: 1 },
  { key: 'vwap_deviation_threshold', label: 'VWAP Deviation Threshold', min: 0.5, max: 3.0, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1.0, max: 3.0, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

const BREAKOUT_SLIDERS: SliderConfig[] = [
  { key: 'lookback', label: 'Lookback Period', min: 10, max: 50, step: 1 },
  { key: 'volume_multiplier', label: 'Volume Multiplier', min: 1.0, max: 4.0, step: 0.1 },
  { key: 'atr_stop_multiplier', label: 'ATR Stop Multiplier', min: 1.0, max: 4.0, step: 0.1 },
  { key: 'atr_target_multiplier', label: 'ATR Target Multiplier', min: 1.0, max: 6.0, step: 0.1 },
  { key: 'min_confidence', label: 'Min Confidence', min: 0.3, max: 0.9, step: 0.05 },
]

function ParamSlider({ config, value, onChange }: { config: SliderConfig; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="label w-44 shrink-0 text-xs">{config.label}</span>
      <input
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-accent-blue h-1.5"
      />
      <span className="font-mono text-sm text-txt-secondary w-12 text-right">{config.step < 1 ? value.toFixed(2) : value}</span>
    </div>
  )
}

function StrategyToggleCard({ name, description, enabled, onToggle }: { name: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`card text-left transition-all duration-150 ${enabled ? 'border-l-2 border-l-accent-blue' : 'opacity-60'}`}
    >
      <div className="flex justify-between items-center">
        <div>
          <div className="font-mono font-bold text-sm">{name}</div>
          <div className="text-xs text-txt-tertiary mt-0.5">{description}</div>
        </div>
        <span className={`pill text-[10px] ${enabled ? 'bg-accent-green-muted text-accent-green' : 'bg-surface-tertiary text-txt-tertiary'}`}>
          {enabled ? 'enabled' : 'disabled'}
        </span>
      </div>
    </button>
  )
}

export default function StrategyBuilder() {
  const { addToast } = useToast()
  const [regime, setRegime] = useState('bull_trend')
  const [enableMomentum, setEnableMomentum] = useState(true)
  const [enableMeanReversion, setEnableMeanReversion] = useState(true)
  const [enableBreakout, setEnableBreakout] = useState(false)

  const [momentumParams, setMomentumParams] = useState<Record<string, number>>({})
  const [meanReversionParams, setMeanReversionParams] = useState<Record<string, number>>({})
  const [breakoutParams, setBreakoutParams] = useState<Record<string, number>>({})

  const [configs, setConfigs] = useState<StrategyConfigSaved[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('new')
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const [ticker, setTicker] = useState('SPY')
  const [capital, setCapital] = useState(100000)
  const [backtesting, setBacktesting] = useState(false)
  const [miniResults, setMiniResults] = useState<{ sharpe: number; returnPct: number; trades: number; maxDD: number } | null>(null)

  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({ momentum: true, mean_reversion: true, breakout: true })

  useEffect(() => {
    fetchStrategyDefaults()
      .then((d: StrategyDefaults) => {
        setMomentumParams(d.momentum)
        setMeanReversionParams(d.mean_reversion)
        setBreakoutParams(d.breakout)
      })
      .catch(() => {})
    loadConfigs()
  }, [])

  const loadConfigs = () => {
    fetchStrategyConfigs().then(setConfigs).catch(() => {})
  }

  const loadConfig = useCallback((id: string) => {
    setSelectedConfigId(id)
    if (id === 'new') return
    const cfg = configs.find(c => c.id === id)
    if (!cfg) return
    if (cfg.regime) setRegime(cfg.regime)
    if (cfg.toggles) {
      setEnableMomentum(cfg.toggles.momentum ?? true)
      setEnableMeanReversion(cfg.toggles.mean_reversion ?? true)
      setEnableBreakout(cfg.toggles.breakout ?? false)
    }
    if (cfg.params) {
      const p = cfg.params
      setMomentumParams(prev => ({ ...prev, ...Object.fromEntries(Object.entries(p).filter(([k]) => MOMENTUM_SLIDERS.some(s => s.key === k))) }))
      setMeanReversionParams(prev => ({ ...prev, ...Object.fromEntries(Object.entries(p).filter(([k]) => MEAN_REVERSION_SLIDERS.some(s => s.key === k))) }))
      setBreakoutParams(prev => ({ ...prev, ...Object.fromEntries(Object.entries(p).filter(([k]) => BREAKOUT_SLIDERS.some(s => s.key === k))) }))
    }
  }, [configs])

  const handleSave = async () => {
    if (!saveName.trim()) return
    try {
      const payload = {
        name: saveName.trim(),
        strategy_name: 'ensemble',
        regime,
        params: { ...momentumParams, ...meanReversionParams, ...breakoutParams },
        toggles: { momentum: enableMomentum, mean_reversion: enableMeanReversion, breakout: enableBreakout },
      }
      const result = await saveStrategyConfig(payload)
      addToast('info', `Config ${result.status}`, `"${result.name}" saved successfully`)
      setShowSaveInput(false)
      setSaveName('')
      loadConfigs()
    } catch {
      addToast('error', 'Save failed', 'Could not save strategy config')
    }
  }

  const handleDelete = async () => {
    if (selectedConfigId === 'new') return
    try {
      await deleteStrategyConfig(selectedConfigId)
      addToast('info', 'Config deleted', 'Strategy configuration removed')
      setSelectedConfigId('new')
      loadConfigs()
    } catch {
      addToast('error', 'Delete failed', 'Could not delete config')
    }
  }

  const handleBacktest = async () => {
    if (!enableMomentum && !enableMeanReversion && !enableBreakout) return
    setBacktesting(true)
    setMiniResults(null)
    try {
      const payload = {
        strategy: 'momentum',
        ticker,
        initial_capital: capital,
        regime,
        toggles: { momentum: enableMomentum, mean_reversion: enableMeanReversion, breakout: enableBreakout },
        params: {
          ...(enableMomentum ? momentumParams : {}),
          ...(enableMeanReversion ? meanReversionParams : {}),
          ...(enableBreakout ? breakoutParams : {}),
        },
      }
      addToast('info', 'Backtest started', `Running ${ticker} backtest...`)
      const result = await runBacktest(payload)
      setMiniResults({
        sharpe: result.metrics?.sharpe_ratio ?? 0,
        returnPct: result.metrics?.total_return_pct ?? 0,
        trades: result.metrics?.total_trades ?? 0,
        maxDD: result.metrics?.max_drawdown_pct ?? 0,
      })
      addToast('signal', 'Backtest complete', `${ticker} • Sharpe: ${(result.metrics?.sharpe_ratio ?? 0).toFixed(2)}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Backtest failed'
      addToast('error', 'Backtest failed', msg)
    } finally {
      setBacktesting(false)
    }
  }

  const noStrategyEnabled = !enableMomentum && !enableMeanReversion && !enableBreakout

  const buildSummary = () => {
    const parts: string[] = []
    const regimeLabel = { bull_trend: 'Bull', bear_trend: 'Bear', sideways: 'Sideways', high_vol: 'High Vol' }[regime] || regime
    parts.push(`When market regime is ${regimeLabel}`)
    const strategies: string[] = []
    if (enableMomentum) {
      const p = momentumParams
      strategies.push(`Momentum (RSI ${p.rsi_low ?? 40}–${p.rsi_high ?? 70}, ADX > ${p.adx_threshold ?? 25}, Volume > ${p.volume_threshold ?? 1.5}×, targeting ${p.atr_target_multiplier ?? 3.0}× ATR with ${p.atr_stop_multiplier ?? 2.0}× ATR stop)`)
    }
    if (enableMeanReversion) {
      const p = meanReversionParams
      strategies.push(`Mean Reversion (RSI(2) < ${p.rsi2_buy_threshold ?? 10}, VWAP deviation > ${p.vwap_deviation_threshold ?? 1.5}%, targeting VWAP reversion with ${p.atr_stop_multiplier ?? 1.5}× ATR stop)`)
    }
    if (enableBreakout) {
      const p = breakoutParams
      strategies.push(`Breakout (${p.lookback ?? 20}-day lookback, Volume > ${p.volume_multiplier ?? 2.0}×, targeting ${p.atr_target_multiplier ?? 3.0}× ATR with ${p.atr_stop_multiplier ?? 2.0}× ATR stop)`)
    }
    if (strategies.length === 0) return 'No strategies enabled. Enable at least one strategy to build a configuration.'
    return `${parts[0]}, use ${strategies.join(' combined with ')}. Min confidence threshold: ${momentumParams.min_confidence ?? meanReversionParams.min_confidence ?? breakoutParams.min_confidence ?? 0.5}.`
  }

  const togglePanel = (key: string) => setExpandedPanels(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="space-y-4">
      {/* Section 1 — Header & Saved Configs */}
      <div className="flex justify-between items-center">
        <h2 className="font-mono font-bold text-lg">Strategy Builder</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedConfigId}
            onChange={e => loadConfig(e.target.value)}
            className="bg-surface-secondary border border-border rounded px-3 py-2 text-sm"
          >
            <option value="new">New Configuration</option>
            {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {showSaveInput ? (
            <div className="flex gap-1">
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Config name"
                className="bg-surface-secondary border border-border rounded px-2 py-1 text-sm w-36"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button className="btn-primary text-xs px-3" onClick={handleSave}>Save</button>
              <button className="text-txt-tertiary text-xs px-2" onClick={() => setShowSaveInput(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn-primary text-xs px-3 py-2" onClick={() => setShowSaveInput(true)}>Save</button>
          )}
          {selectedConfigId !== 'new' && (
            <button className="text-accent-red text-xs hover:underline" onClick={handleDelete}>Delete</button>
          )}
        </div>
      </div>

      {/* Section 2 — Regime & Strategy Selection */}
      <div className="card space-y-4">
        <div>
          <div className="label mb-1">Market Regime</div>
          <select value={regime} onChange={e => setRegime(e.target.value)} className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm">
            <option value="bull_trend">Bull</option>
            <option value="bear_trend">Bear</option>
            <option value="sideways">Sideways</option>
            <option value="high_vol">High Vol</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StrategyToggleCard name="Momentum" description="Trend-following with RSI, ADX, and volume filters" enabled={enableMomentum} onToggle={() => setEnableMomentum(!enableMomentum)} />
          <StrategyToggleCard name="Mean Reversion" description="RSI(2) oversold/overbought with VWAP deviation" enabled={enableMeanReversion} onToggle={() => setEnableMeanReversion(!enableMeanReversion)} />
          <StrategyToggleCard name="Breakout" description="Channel breakouts with volume confirmation" enabled={enableBreakout} onToggle={() => setEnableBreakout(!enableBreakout)} />
        </div>
      </div>

      {/* Section 3 — Parameter Panels */}
      {enableMomentum && (
        <div className="card">
          <button type="button" className="w-full flex justify-between items-center" onClick={() => togglePanel('momentum')}>
            <h3 className="font-mono font-bold text-sm">Momentum Parameters</h3>
            <span className="text-txt-tertiary text-xs">{expandedPanels.momentum ? '▼' : '▶'}</span>
          </button>
          {expandedPanels.momentum && (
            <div className="mt-3 space-y-1">
              {MOMENTUM_SLIDERS.map(s => (
                <ParamSlider key={s.key} config={s} value={momentumParams[s.key] ?? s.min} onChange={v => setMomentumParams(p => ({ ...p, [s.key]: v }))} />
              ))}
            </div>
          )}
        </div>
      )}

      {enableMeanReversion && (
        <div className="card">
          <button type="button" className="w-full flex justify-between items-center" onClick={() => togglePanel('mean_reversion')}>
            <h3 className="font-mono font-bold text-sm">Mean Reversion Parameters</h3>
            <span className="text-txt-tertiary text-xs">{expandedPanels.mean_reversion ? '▼' : '▶'}</span>
          </button>
          {expandedPanels.mean_reversion && (
            <div className="mt-3 space-y-1">
              {MEAN_REVERSION_SLIDERS.map(s => (
                <ParamSlider key={s.key} config={s} value={meanReversionParams[s.key] ?? s.min} onChange={v => setMeanReversionParams(p => ({ ...p, [s.key]: v }))} />
              ))}
            </div>
          )}
        </div>
      )}

      {enableBreakout && (
        <div className="card">
          <button type="button" className="w-full flex justify-between items-center" onClick={() => togglePanel('breakout')}>
            <h3 className="font-mono font-bold text-sm">Breakout Parameters</h3>
            <span className="text-txt-tertiary text-xs">{expandedPanels.breakout ? '▼' : '▶'}</span>
          </button>
          {expandedPanels.breakout && (
            <div className="mt-3 space-y-1">
              {BREAKOUT_SLIDERS.map(s => (
                <ParamSlider key={s.key} config={s} value={breakoutParams[s.key] ?? s.min} onChange={v => setBreakoutParams(p => ({ ...p, [s.key]: v }))} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 4 — Strategy Summary */}
      <div className="card">
        <h3 className="font-mono font-bold text-sm mb-2">Strategy Summary</h3>
        <p className="font-sans text-sm text-txt-secondary leading-relaxed">{buildSummary()}</p>
      </div>

      {/* Section 5 — Quick Backtest */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="label mb-1">Ticker</div>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono w-24" />
          </div>
          <div>
            <div className="label mb-1">Capital</div>
            <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))} className="bg-surface-tertiary border border-border rounded px-3 py-2 text-sm font-mono w-32" />
          </div>
          <div className="relative">
            <button
              className="btn-primary"
              onClick={handleBacktest}
              disabled={backtesting || noStrategyEnabled}
              title={noStrategyEnabled ? 'Enable at least one strategy' : undefined}
            >
              {backtesting ? 'Running...' : 'Quick Backtest'}
            </button>
          </div>
        </div>
        {noStrategyEnabled && <p className="text-xs text-accent-amber mt-2">Enable at least one strategy to run a backtest.</p>}
        {miniResults && (
          <div className="grid grid-cols-4 gap-3 mt-4">
            <div className="card bg-surface-tertiary text-center py-3">
              <div className="text-xs text-txt-tertiary">Sharpe</div>
              <div className="font-mono font-bold text-lg">{miniResults.sharpe.toFixed(2)}</div>
            </div>
            <div className="card bg-surface-tertiary text-center py-3">
              <div className="text-xs text-txt-tertiary">Return</div>
              <div className={`font-mono font-bold text-lg ${miniResults.returnPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{miniResults.returnPct.toFixed(1)}%</div>
            </div>
            <div className="card bg-surface-tertiary text-center py-3">
              <div className="text-xs text-txt-tertiary">Trades</div>
              <div className="font-mono font-bold text-lg">{miniResults.trades}</div>
            </div>
            <div className="card bg-surface-tertiary text-center py-3">
              <div className="text-xs text-txt-tertiary">Max DD</div>
              <div className="font-mono font-bold text-lg text-accent-red">{miniResults.maxDD.toFixed(1)}%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
