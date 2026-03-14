import { useState, useEffect } from 'react'
import { fetchTickers, fetchSignals } from '../api'
import type { TickerSummary, Signal } from '../types'
import SignalCard from './SignalCard'

export default function TickerView() {
  const [tickers, setTickers] = useState<TickerSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTickers()
      .then(setTickers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) { setSignals([]); return }
    fetchSignals({ ticker: selected, limit: 50 })
      .then(setSignals)
      .catch(e => setError(e.message))
  }, [selected])

  if (loading) return <div className="text-center text-gray-500 py-12">Loading tickers...</div>
  if (error) return <div className="bg-bearish/10 border border-bearish/30 rounded p-3 text-sm text-bearish">{error}</div>

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Tickers</h2>

      {tickers.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No tickers tracked yet.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {tickers.map(t => (
            <button
              key={t.ticker}
              onClick={() => setSelected(t.ticker === selected ? null : t.ticker)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                t.ticker === selected
                  ? 'bg-info/10 border-info/40'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="font-bold font-mono text-lg">{t.ticker}</div>
              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                <div>Signals: <span className="font-mono text-gray-300">{t.total_signals}</span></div>
                <div>Win rate: <span className="font-mono text-gray-300">{(t.win_rate * 100).toFixed(0)}%</span></div>
                <div>Last: <span className="font-mono text-gray-400">
                  {t.last_signal_date ? new Date(t.last_signal_date).toLocaleDateString() : '—'}
                </span></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Signals for {selected}
          </h3>
          {signals.length === 0 ? (
            <div className="text-sm text-gray-500">No signals for this ticker.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {signals.map(s => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
