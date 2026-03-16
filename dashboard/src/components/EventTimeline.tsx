import { useState, useEffect, useRef } from 'react'
import { fetchEvents } from '../api'
import type { EventData } from '../types'
import { SkeletonEventCard } from './SkeletonCard'
import { useStaggeredList } from '../hooks/useStaggeredList'
import { useToast } from '../hooks/useToast'
import { usePersistedState } from '../hooks/usePersistedState'

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

function isRecent(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 30 * 60 * 1000
}

function confidenceBarColor(c: number): string {
  if (c >= 0.7) return '#00d68f'
  if (c >= 0.4) return '#ffab00'
  return '#ff3d5a'
}

interface Props {
  onTickerClick?: (ticker: string) => void
}

export default function EventTimeline({ onTickerClick }: Props = {}) {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = usePersistedState('eventTicker', '')
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())

  const prevEventIds = useRef<Set<string>>(new Set())
  const { addToast } = useToast()
  const { ready, getDelay } = useStaggeredList(events)

  useEffect(() => {
    setLoading(true)
    fetchEvents({ ticker: ticker || undefined, limit: 50 })
      .then(newEvents => {
        if (prevEventIds.current.size > 0) {
          newEvents.forEach(ev => {
            if (!prevEventIds.current.has(ev.id)) {
              addToast(
                'event',
                `New Event: ${ev.ticker}`,
                `${ev.event_type.replace(/_/g, ' ')} \u00B7 ${ev.direction}`,
              )
            }
          })
        }
        prevEventIds.current = new Set(newEvents.map(ev => ev.id))
        setEvents(newEvents)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  const toggleArticles = (id: string) => {
    setExpandedArticles(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredEvents = keywordFilter
    ? events.filter(ev => {
        const themes = (ev.metadata as Record<string, unknown> | null)?.common_themes as string[] | undefined
        return themes?.some(t => t.toLowerCase().includes(keywordFilter.toLowerCase()))
      })
    : events

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u25C9'} Events
        </h2>
        <input
          id="event-ticker-search"
          type="text"
          placeholder="Ticker..."
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          className="w-28 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
        />
      </div>

      {keywordFilter && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-txt-secondary text-xs font-sans">Filtered by:</span>
          <button
            onClick={() => setKeywordFilter(null)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-blue/20 text-accent-blue text-xs font-sans font-medium hover:bg-accent-blue/30 transition-colors"
          >
            {keywordFilter}
            <span className="text-accent-blue/60 ml-1">{'\u00D7'}</span>
          </button>
        </div>
      )}

      {error && (
        <div className="card border-accent-red/30 bg-accent-red-muted mb-6">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 ml-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonEventCard key={i} />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No events detected.</p>
          <p className="text-txt-tertiary text-xs">The market is quiet — or your thresholds are working perfectly.</p>
        </div>
      ) : (
        <div className="relative ml-3 stagger-container">
          {/* Vertical line with fade animation */}
          <div
            className="absolute left-[3px] top-2 bottom-2 w-[2px]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              animation: 'timelineFade 600ms ease-out forwards',
            }}
          />

          {filteredEvents.map((ev, idx) => {
            const meta = ev.metadata as Record<string, unknown> | null
            const themes = (meta?.common_themes as string[]) ?? []
            const articleCount = ev.article_ids?.length ?? 0
            const badge = EVENT_BADGE[ev.event_type] ?? { bg: 'bg-surface-tertiary', text: 'text-txt-secondary' }
            const recent = isRecent(ev.detected_at)
            const articlesExpanded = expandedArticles.has(ev.id)

            return (
              <div
                key={ev.id}
                className={`relative pl-8 pb-6 group ${ready ? 'stagger-item' : ''}`}
                style={ready ? getDelay(idx) : undefined}
              >
                {/* Timeline dot */}
                <div className={`absolute left-0 top-3 w-2 h-2 rounded-full ring-[3px] ring-surface-tertiary ${DOT_COLOR[ev.direction] ?? 'bg-txt-tertiary'} ${
                  recent ? 'animate-dot-pulse' : 'animate-dot-pulse-once'
                }`} />

                <div className="card py-4 px-5 group-hover:border-border-hover">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`font-mono font-bold ${onTickerClick ? 'text-accent-blue cursor-pointer hover:underline' : 'text-txt-primary'}`}
                      onClick={() => onTickerClick?.(ev.ticker)}
                    >{ev.ticker}</span>
                    <span className={`pill text-[10px] py-0.5 px-2 ${badge.bg} ${badge.text}`}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs font-sans font-medium ${ev.direction === 'bullish' ? 'text-accent-green' : 'text-accent-red'}`}>
                      {ev.direction}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <div
                        className="w-10 h-1 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                        title={`Confidence: ${(ev.confidence * 100).toFixed(0)}% — This event's sentiment certainty score`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${ev.confidence * 100}%`,
                            background: confidenceBarColor(ev.confidence),
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-txt-tertiary">
                        {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-txt-tertiary text-[11px] font-sans">
                    {ev.detected_at && <span>{relativeTime(ev.detected_at)}</span>}
                    {articleCount > 0 && (
                      <span
                        className={`${ev.article_ids && ev.article_ids.length > 0 ? 'cursor-pointer hover:text-accent-blue transition-colors' : ''}`}
                        onClick={() => { if (ev.article_ids && ev.article_ids.length > 0) toggleArticles(ev.id) }}
                      >
                        {articleCount} article{articleCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {recent && (
                      <span className="text-accent-green text-[10px] font-mono uppercase tracking-wider">LIVE</span>
                    )}
                  </div>

                  {/* Expandable articles section */}
                  {articleCount > 0 && (
                    <div
                      className="overflow-hidden transition-all duration-200 ease-out"
                      style={{ maxHeight: articlesExpanded ? '200px' : '0px' }}
                    >
                      <div className="mt-3 pt-3 border-t border-border space-y-1">
                        {themes.length > 0 ? (
                          themes.map((theme, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-txt-secondary">
                              <span className="w-1 h-1 rounded-full bg-txt-tertiary shrink-0" />
                              <span>{theme}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-txt-tertiary">{articleCount} articles detected for this event</p>
                        )}
                      </div>
                    </div>
                  )}

                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {themes.slice(0, 5).map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-surface-tertiary text-txt-tertiary text-[11px] font-sans cursor-pointer hover:bg-surface-primary hover:text-txt-secondary transition-all duration-150"
                          onClick={() => setKeywordFilter(keywordFilter === t ? null : t)}
                        >
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
