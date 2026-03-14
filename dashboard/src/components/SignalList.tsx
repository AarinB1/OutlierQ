import { useState, useEffect } from 'react'
import { fetchSignals } from '../api'
import type { Signal } from '../types'
import SignalCard from './SignalCard'

export default function SignalList() {
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Trade Signals</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Filter by ticker..."
            value={ticker}
            onChange={e => { setTicker(e.target.value.toUpperCase()); setPage(0) }}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-info focus:outline-none w-36"
          />
          <select
            value={direction}
            onChange={e => { setDirection(e.target.value); setPage(0) }}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:border-info focus:outline-none"
          >
            <option value="">All directions</option>
            <option value="call">Calls only</option>
            <option value="put">Puts only</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-bearish/10 border border-bearish/30 rounded p-3 text-sm text-bearish mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading signals...</div>
      ) : signals.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          No signals found. Run a scan to generate signals.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {signals.map(s => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
          <div className="flex justify-center gap-4 mt-6">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-700"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500 self-center font-mono">
              Page {page + 1}
            </span>
            <button
              disabled={signals.length < limit}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-sm rounded bg-gray-800 text-gray-300 disabled:opacity-30 hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
