import { useState, useEffect, useRef } from 'react'
import { fetchEvents } from '../api'
import type { EventData } from '../types'
import { useToast } from '../components/Toast'
import { useStaggeredList } from '../hooks/useStaggeredList'
import { usePersistedState } from '../hooks/usePersistedState'
import { SkeletonEventCard } from './SkeletonCard'

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

function isRecent(iso: string, withinMins = 30): boolean {
  return Date.now() - new Date(iso).getTime() < withinMins * 60 * 1000
}

function sentimentBarColor(c: number): string {
  if (c >= 0.7) return '#00d68f'
  if (c >= 0.4) return '#ffab00'
  return '#ff3d5a'
}

interface Props {
  onTickerClick?: (ticker: string) => void
  tickerSearchRef?: React.RefObject<HTMLInputElement>
}

export default function EventTimeline({ onTickerClick, tickerSearchRef }: Props = {}) {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = usePersistedState('event-timeline-ticker', '')
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set())
  const prevIdsRef = useRef<Set<string>>(new Set())
  const { addToast } = useToast()
  const filteredEvents = keywordFilter
    ? events.filter(ev => {
        const meta = ev.metadata as Record<string, unknown> | null
        const themes = (meta?.common_themes as string[]) ?? []
        return themes.some(t => t.toLowerCase().includes(keywordFilter.toLowerCase()))
      })
    : events
  const { visibleItems, getDelay } = useStaggeredList(filteredEvents, 50)

  useEffect(() => {
    setLoading(true)
    fetchEvents({ ticker: ticker || undefined, limit: 50 })
      .then(newEvents => {
        const prevIds = prevIdsRef.current
        const newIds = new Set(newEvents.map(e => e.id))
        if (prevIds.size > 0) {
          newEvents.forEach(ev => {
            if (!prevIds.has(ev.id)) {
              addToast('event', `New Event: ${ev.ticker}`, `${ev.event_type.replace(/_/g, ' ')} · ${(ev.confidence * 100).toFixed(0)}%`)
            }
          })
        }
        prevIdsRef.current = newIds
        setEvents(newEvents)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker, addToast])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u25C9'} Events
        </h2>
        <div className="flex items-center gap-3">
          {keywordFilter && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-tertiary text-txt-secondary text-xs font-sans">
              Filtered by: <span className="font-mono text-txt-primary">{keywordFilter}</span>
              <button
                type="button"
                onClick={() => setKeywordFilter(null)}
                className="text-txt-tertiary hover:text-txt-primary transition-colors"
                aria-label="Clear filter"
              >
                {'\u2715'}
              </button>
            </span>
          )}
          <input
          ref={tickerSearchRef}
          type="text"
          placeholder="Ticker..."
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
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
        <div className="space-y-4 ml-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonEventCard key={i} />
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
          {/* Vertical line - fade in */}
          <div
            className="absolute left-[3px] top-2 bottom-2 w-[2px] timeline-line"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.06))' }}
          />

          {visibleItems.map((ev, i) => {
            const meta = ev.metadata as Record<string, unknown> | null
            const themes = (meta?.common_themes as string[]) ?? []
            const articleCount = ev.article_ids?.length ?? 0
            const badge = EVENT_BADGE[ev.event_type] ?? { bg: 'bg-surface-tertiary', text: 'text-txt-secondary' }
            const dotColor = DOT_COLOR[ev.direction] ?? 'bg-txt-tertiary'
            const recent = ev.detected_at ? isRecent(ev.detected_at) : false
            const articlesExpanded = expandedArticles.has(ev.id)

            return (
              <div
                key={ev.id}
                className="relative pl-8 pb-6 group stagger-item"
                style={{ animationDelay: `${getDelay(i)}ms` }}
              >
                {/* Timeline dot - pulse on mount, persistent for recent */}
                <div
                  className={`absolute left-0 top-3 w-2 h-2 rounded-full ring-[3px] ring-surface-tertiary ${dotColor} ${recent ? 'animate-pulse' : ''}`}
                  style={{ animation: recent ? undefined : 'dotPulse 600ms ease-out 1' }}
                />

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
                        className="w-10 h-1 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                        title={`Confidence: ${(ev.confidence * 100).toFixed(0)}% — This event's sentiment certainty score`}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${ev.confidence * 100}%`,
                            backgroundColor: sentimentBarColor(ev.confidence),
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-txt-tertiary w-8">
                        {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-txt-tertiary text-[11px] font-sans">
                    {ev.detected_at && <span>{relativeTime(ev.detected_at)}</span>}
                    {articleCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setExpandedArticles(prev => {
                          const next = new Set(prev)
                          if (next.has(ev.id)) next.delete(ev.id)
                          else next.add(ev.id)
                          return next
                        })}
                        className="cursor-pointer hover:text-accent-blue transition-colors"
                      >
                        {articleCount} article{articleCount > 1 ? 's' : ''}
                      </button>
                    ) : null}
                  </div>

                  {/* Expandable article previews */}
                  {articleCount > 0 && articlesExpanded && (
                    <div className="mt-2 pl-0 overflow-hidden animate-[expandHeight_200ms_ease-out]">
                      <div className="border-t border-border pt-2 mt-2 space-y-1">
                        {themes.length > 0 ? (
                          themes.map((theme, ti) => (
                            <div key={ti} className="flex items-start gap-1.5 text-xs font-sans text-txt-secondary">
                              <span className="text-txt-tertiary mt-0.5">{'\u2022'}</span>
                              <span>{theme}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-txt-tertiary text-xs">Articles detected</p>
                        )}
                      </div>
                    </div>
                  )}

                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {themes.slice(0, 5).map((t, ti) => (
                        <button
                          key={ti}
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setKeywordFilter(prev => prev === t ? null : t)
                          }}
                          className="px-2 py-0.5 rounded bg-surface-tertiary text-txt-tertiary text-[11px] font-sans hover:bg-surface-primary hover:text-txt-secondary transition-all duration-150 cursor-pointer"
                        >
                          {t}
                        </button>
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
