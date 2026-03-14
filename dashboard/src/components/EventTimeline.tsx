import { useState, useEffect } from 'react'
import { fetchEvents } from '../api'
import type { EventData } from '../types'

const EVENT_BADGE: Record<string, { bg: string; text: string }> = {
  scandal:        { bg: 'bg-accent-red-muted', text: 'text-accent-red' },
  legal:          { bg: 'bg-accent-red-muted', text: 'text-accent-red' },
  earnings_miss:  { bg: 'bg-accent-amber-muted', text: 'text-accent-amber' },
  recall:         { bg: 'bg-accent-amber-muted', text: 'text-accent-amber' },
  fda_approval:   { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  breakthrough:   { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  major_contract: { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  earnings_beat:  { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
}

const DOT_COLOR: Record<string, string> = {
  bullish: 'bg-accent-green',
  bearish: 'bg-accent-red',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
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
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u25C9'} Events
        </h2>
        <input
          type="text"
          placeholder="Ticker..."
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          className="w-28 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
        />
      </div>

      {error && (
        <div className="card border-accent-red/30 bg-accent-red-muted mb-6">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 ml-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-20 ml-6" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No events detected.</p>
          <p className="text-txt-tertiary text-xs">The market is quiet — or your thresholds are working perfectly.</p>
        </div>
      ) : (
        <div className="relative ml-3">
          {/* Vertical line */}
          <div className="absolute left-[3px] top-2 bottom-2 w-[2px]" style={{ background: 'rgba(255,255,255,0.06)' }} />

          {events.map(ev => {
            const meta = ev.metadata as Record<string, unknown> | null
            const themes = (meta?.common_themes as string[]) ?? []
            const articleCount = ev.article_ids?.length ?? 0
            const badge = EVENT_BADGE[ev.event_type] ?? { bg: 'bg-surface-tertiary', text: 'text-txt-secondary' }

            return (
              <div key={ev.id} className="relative pl-8 pb-6 group">
                {/* Timeline dot */}
                <div className={`absolute left-0 top-3 w-2 h-2 rounded-full ring-[3px] ring-surface-tertiary ${DOT_COLOR[ev.direction] ?? 'bg-txt-tertiary'}`} />

                <div className="card py-4 px-5 group-hover:border-border-hover">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono font-bold text-txt-primary">{ev.ticker}</span>
                    <span className={`pill text-[10px] py-0.5 px-2 ${badge.bg} ${badge.text}`}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-sans font-medium ${ev.direction === 'bullish' ? 'text-accent-green' : 'text-accent-red'}`}>
                      {ev.direction}
                    </span>
                    <span className="font-mono text-xs text-txt-tertiary ml-auto">
                      {(ev.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-txt-tertiary text-[11px] font-sans">
                    {ev.detected_at && <span>{relativeTime(ev.detected_at)}</span>}
                    {articleCount > 0 && (
                      <span>{articleCount} article{articleCount > 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {themes.slice(0, 5).map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-surface-tertiary text-txt-tertiary text-[11px] font-sans">
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
