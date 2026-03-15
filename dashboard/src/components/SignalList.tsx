import { useState, useEffect } from 'react'
import { fetchSignals } from '../api'
import type { Signal } from '../types'
import SignalCard from './SignalCard'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'call', label: 'Calls' },
  { key: 'put', label: 'Puts' },
] as const

interface Props {
  onTickerClick?: (ticker: string) => void
}

export default function SignalList({ onTickerClick }: Props = {}) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')
  const [direction, setDirection] = useState('')
  const [page, setPage] = useState(0)
  const limit = 20

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchSignals({
      ticker: ticker || undefined,
      direction: direction || undefined,
      limit,
      offset: page * limit,
    })
      .then(setSignals)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker, direction, page])

  return (
    <div>
      {/* Header + Filters */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u26A1'} Signals
        </h2>
        <div className="flex items-center gap-3">
          {/* Direction pills */}
          <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 border border-border">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => { setDirection(f.key); setPage(0) }}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-150 ${
                  direction === f.key
                    ? 'bg-surface-tertiary text-txt-primary'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Ticker input */}
          <input
            type="text"
            placeholder="Ticker..."
            value={ticker}
            onChange={e => { setTicker(e.target.value.toUpperCase()); setPage(0) }}
            className="w-28 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
          />
        </div>
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red-muted mb-6">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-52" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No signals yet.</p>
          <p className="text-txt-tertiary text-xs">Run a scan to detect outlier events.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {signals.map(s => (
              <SignalCard key={s.id} signal={s} onTickerClick={onTickerClick} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-6 mt-8">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-txt-secondary hover:text-txt-primary disabled:opacity-30 text-sm font-sans transition-colors duration-150"
            >
              {'\u2190'} Prev
            </button>
            <span className="text-txt-tertiary text-xs font-mono">
              Showing {page * limit + 1}\u2013{page * limit + signals.length}
            </span>
            <button
              disabled={signals.length < limit}
              onClick={() => setPage(p => p + 1)}
              className="text-txt-secondary hover:text-txt-primary disabled:opacity-30 text-sm font-sans transition-colors duration-150"
            >
              Next {'\u2192'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
