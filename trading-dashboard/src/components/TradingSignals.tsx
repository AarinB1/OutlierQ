import { useEffect, useState } from 'react'
import { fetchTradingSignals, generateTradingSignals } from '../api'
import type { TradingSignal } from '../types'

export default function TradingSignals() {
  const [signals, setSignals] = useState<TradingSignal[]>([])
  const [ticker, setTicker] = useState('AAPL')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetchTradingSignals()
      .then(setSignals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const onGenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      await generateTradingSignals({ ticker: ticker.toUpperCase(), timeframe: 'daily' })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed generating signals')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="font-mono font-bold text-lg">Trading Signals</h2>
        <div className="flex gap-2">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-surface-secondary border border-border rounded px-3 py-2 text-sm"
            placeholder="Ticker"
          />
          <button className="btn-primary" onClick={onGenerate} disabled={busy}>
            {busy ? 'Generating...' : 'Generate Signal'}
          </button>
        </div>
      </div>
      {error && <div className="card mb-3 text-accent-red text-sm">{error}</div>}
      {loading ? (
        <div className="card">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {signals.map((s) => (
            <div key={s.id} className="card">
              <div className="flex justify-between mb-2">
                <span className="font-mono font-bold text-xl">{s.ticker}</span>
                <span
                  className={`pill ${
                    s.direction === 'BUY' ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'
                  }`}
                >
                  {s.direction}
                </span>
              </div>
              <div className="text-sm text-txt-secondary mb-1">Strategy: {s.strategy_name}</div>
              <div className="text-sm text-txt-secondary mb-1">Confidence: {(s.confidence * 100).toFixed(0)}%</div>
              <div className="text-sm text-txt-secondary">
                Entry {s.entry_price?.toFixed(2)} / Target {s.target_price?.toFixed(2)} / Stop {s.stop_loss?.toFixed(2)}
              </div>
            </div>
          ))}
          {signals.length === 0 && <div className="card">No trading signals yet.</div>}
        </div>
      )}
    </div>
  )
}

