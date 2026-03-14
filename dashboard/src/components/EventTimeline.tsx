import { useState, useEffect } from 'react'
import { fetchEvents } from '../api'
import type { EventData } from '../types'

const EVENT_COLORS: Record<string, string> = {
  scandal: 'bg-bearish',
  legal: 'bg-bearish',
  earnings_miss: 'bg-bearish',
  recall: 'bg-warning',
  fda_approval: 'bg-bullish',
  breakthrough: 'bg-bullish',
  major_contract: 'bg-bullish',
  earnings_beat: 'bg-bullish',
  other: 'bg-gray-500',
}

export default function EventTimeline() {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchEvents({ ticker: ticker || undefined, limit: 50 })
      .then(setEvents)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Event Timeline</h2>
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-info focus:outline-none w-36"
        />
      </div>

      {error && (
        <div className="bg-bearish/10 border border-bearish/30 rounded p-3 text-sm text-bearish mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="text-center text-gray-500 py-12">No events detected yet.</div>
      ) : (
        <div className="relative ml-4 border-l border-gray-800">
          {events.map(ev => {
            const meta = ev.metadata as Record<string, unknown> | null
            const themes = (meta?.common_themes as string[]) ?? []
            const articleCount = ev.article_ids?.length ?? 0

            return (
              <div key={ev.id} className="relative pl-6 pb-6 group">
                {/* Timeline dot */}
                <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ${
                  EVENT_COLORS[ev.event_type] ?? 'bg-gray-500'
                } ring-2 ring-gray-950`} />

                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-bold font-mono text-gray-200">{ev.ticker}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      EVENT_COLORS[ev.event_type] ?? 'bg-gray-500'
                    }/20 text-gray-200`}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs ${
                      ev.direction === 'bullish' ? 'text-bullish' : 'text-bearish'
                    }`}>
                      {ev.direction}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      {(ev.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="text-xs text-gray-500">
                    {ev.detected_at ? new Date(ev.detected_at).toLocaleString() : '—'}
                    {articleCount > 0 && (
                      <span className="ml-3">{articleCount} article{articleCount > 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {themes.slice(0, 5).map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">
                          {t}
                        </span>
                      ))}
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
