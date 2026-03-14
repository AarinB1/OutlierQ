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

  if (loading) return (
    <div>
      <div className="skeleton h-8 w-40 mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="card border-accent-red/30 bg-accent-red-muted">
      <p className="text-accent-red text-sm">{error}</p>
    </div>
  )

  return (
    <div>
      <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight mb-8">
        {'\u2B21'} Tickers
      </h2>

      {tickers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No tickers tracked yet.</p>
          <p className="text-txt-tertiary text-xs">Run a scan to start tracking tickers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {tickers.map(t => {
            const isActive = t.ticker === selected
            return (
              <button
                key={t.ticker}
                onClick={() => setSelected(isActive ? null : t.ticker)}
                className={`text-left card transition-all duration-150 ${
                  isActive
                    ? 'border-accent-blue bg-accent-blue-muted'
                    : 'hover:border-border-hover'
                }`}
              >
                <div className="font-mono font-bold text-xl text-txt-primary mb-3">{t.ticker}</div>
                <div className="space-y-1.5 text-xs font-sans">
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">Signals</span>
                    <span className="font-mono text-txt-primary">{t.total_signals}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">Win rate</span>
                    <span className={`font-mono ${t.win_rate >= 0.5 ? 'text-accent-green' : t.win_rate > 0 ? 'text-accent-red' : 'text-txt-secondary'}`}>
                      {(t.win_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">Last signal</span>
                    <span className="font-mono text-txt-tertiary text-[11px]">
                      {t.last_signal_date ? new Date(t.last_signal_date).toLocaleDateString() : '\u2014'}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="animate-fade-in">
          <h3 className="font-mono font-bold text-sm text-txt-secondary mb-4 tracking-tight">
            Signals for <span className="text-txt-primary">{selected}</span>
          </h3>
          {signals.length === 0 ? (
            <p className="text-txt-tertiary text-sm">No signals for this ticker.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
