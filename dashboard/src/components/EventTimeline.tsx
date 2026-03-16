import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchEvents } from '../api'
import type { EventData } from '../types'
import { SkeletonEventCard } from './SkeletonCard'
import { usePersistedState } from '../hooks/usePersistedState'
import { useStaggeredList } from '../hooks/useStaggeredList'
import { useToast } from '../hooks/useToast'

const EVENT_BADGE: Record<string, { bg: string; text: string }> = {
  scandal: { bg: 'bg-accent-red-muted', text: 'text-accent-red' },
  legal: { bg: 'bg-accent-red-muted', text: 'text-accent-red' },
  earnings_miss: { bg: 'bg-accent-amber-muted', text: 'text-accent-amber' },
  recall: { bg: 'bg-accent-amber-muted', text: 'text-accent-amber' },
  fda_approval: { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  breakthrough: { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  major_contract: { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
  earnings_beat: { bg: 'bg-accent-green-muted', text: 'text-accent-green' },
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
  return Date.now() - new Date(iso).getTime() <= 30 * 60 * 1000
}

interface Props {
  onTickerClick?: (ticker: string) => void
}

export default function EventTimeline({ onTickerClick }: Props = {}) {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = usePersistedState('outlierq-events-ticker-filter', '')
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null)
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({})
  const previousEventIdsRef = useRef<Set<string> | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchEvents({ ticker: ticker || undefined, limit: 50 })
      .then((nextEvents) => {
        setEvents(nextEvents)

        const previousIds = previousEventIdsRef.current
        if (previousIds) {
          nextEvents
            .filter((event) => !previousIds.has(event.id))
            .forEach((event) =>
              addToast(
                'event',
                `New Event: ${event.ticker} ${event.event_type.replace(/_/g, ' ')}`,
                `${Math.round(event.confidence * 100)}% confidence · ${event.direction}`
              )
            )
        }

        previousEventIdsRef.current = new Set(nextEvents.map((event) => event.id))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker, addToast])

  const filteredEvents = useMemo(() => {
    if (!keywordFilter) {
      return events
    }

    return events.filter((event) => {
      const themes =
        ((event.metadata as Record<string, unknown> | null)?.common_themes as string[] | undefined) ?? []
      return themes.some((theme) => theme.toLowerCase().includes(keywordFilter.toLowerCase()))
    })
  }, [events, keywordFilter])

  const { visibleItems, getDelay } = useStaggeredList(filteredEvents, 50)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">{'\u25C9'} Events</h2>
        <input
          id="global-ticker-search"
          type="text"
          placeholder="Ticker..."
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="w-28 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm font-mono text-txt-primary placeholder-txt-tertiary transition-colors duration-150 focus:border-accent-blue focus:outline-none"
        />
      </div>

      {error && (
        <div className="card mb-6 border-accent-red/30 bg-accent-red-muted">
          <p className="text-sm text-accent-red">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="ml-5 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonEventCard key={i} />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 text-4xl text-txt-tertiary">{'\u25C7'}</div>
          <p className="mb-1 text-sm text-txt-secondary">
            {keywordFilter ? 'No events match this keyword.' : 'No events detected.'}
          </p>
          <p className="text-xs text-txt-tertiary">The market is quiet — or your thresholds are working perfectly.</p>
        </div>
      ) : (
        <div className="relative ml-3">
          <div className="timeline-line-animate absolute bottom-2 left-[3px] top-2 w-[2px]" />

          {keywordFilter && (
            <div className="mb-4 ml-8">
              <button
                type="button"
                onClick={() => setKeywordFilter(null)}
                className="interactive-pill inline-flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs text-txt-secondary hover:text-txt-primary"
              >
                Filtered by: {keywordFilter} <span aria-hidden="true">×</span>
              </button>
            </div>
          )}

          <div className="stagger-container">
            {visibleItems.map((event, index) => {
              const meta = event.metadata as Record<string, unknown> | null
              const themes = (meta?.common_themes as string[]) ?? []
              const articleCount = event.article_ids?.length ?? 0
              const badge =
                EVENT_BADGE[event.event_type] ?? { bg: 'bg-surface-tertiary', text: 'text-txt-secondary' }
              const showArticles = Boolean(expandedArticles[event.id])
              const articleLines = themes.length > 0 ? themes : ['Articles detected']
              const confidenceGradient =
                event.confidence >= 0.7
                  ? 'linear-gradient(90deg, #00d68f, #00d68f)'
                  : event.confidence >= 0.4
                    ? 'linear-gradient(90deg, #ffab00, #00d68f)'
                    : 'linear-gradient(90deg, #ff3d5a, #ffab00)'

              return (
                <div key={event.id} className="stagger-item relative pb-6 pl-8 group" style={getDelay(index)}>
                  <div
                    className={`timeline-dot-intro absolute left-0 top-3 h-2 w-2 rounded-full ring-[3px] ring-surface-tertiary ${
                      DOT_COLOR[event.direction] ?? 'bg-txt-tertiary'
                    } ${isRecent(event.detected_at) ? 'animate-pulse' : ''}`}
                    style={getDelay(index)}
                  />

                  <div className="card px-5 py-4 group-hover:border-border-hover">
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className={`font-mono font-bold ${
                          onTickerClick ? 'cursor-pointer text-accent-blue hover:underline' : 'text-txt-primary'
                        }`}
                        onClick={() => onTickerClick?.(event.ticker)}
                      >
                        {event.ticker}
                      </span>
                      <span className={`pill px-2 py-0.5 text-[10px] ${badge.bg} ${badge.text}`}>
                        {event.event_type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          event.direction === 'bullish' ? 'text-accent-green' : 'text-accent-red'
                        }`}
                      >
                        {event.direction}
                      </span>
                      <div
                        className="ml-auto flex items-center gap-2"
                        title={`Confidence: ${(event.confidence * 100).toFixed(0)}% — This event's sentiment certainty score`}
                      >
                        <div className="h-1 w-10 rounded-full bg-white/5">
                          <div
                            className="confidence-bar h-full rounded-full"
                            style={{ width: `${event.confidence * 100}%`, background: confidenceGradient }}
                          />
                        </div>
                        <span className="font-mono text-xs text-txt-tertiary">
                          {(event.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-txt-tertiary">
                      {event.detected_at && <span>{relativeTime(event.detected_at)}</span>}
                      {articleCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedArticles((current) => ({
                              ...current,
                              [event.id]: !current[event.id],
                            }))
                          }
                          className="transition-colors hover:text-accent-blue"
                        >
                          {articleCount} article{articleCount > 1 ? 's' : ''}
                        </button>
                      )}
                    </div>

                    {themes.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {themes.slice(0, 5).map((theme, themeIndex) => (
                          <button
                            key={`${theme}-${themeIndex}`}
                            type="button"
                            onClick={() => setKeywordFilter((current) => (current === theme ? null : theme))}
                            className={`interactive-pill rounded px-2 py-0.5 text-[11px] ${
                              keywordFilter === theme
                                ? 'bg-surface-primary text-txt-primary'
                                : 'bg-surface-tertiary text-txt-tertiary hover:bg-surface-primary hover:text-txt-primary'
                            }`}
                          >
                            {theme}
                            {keywordFilter === theme ? ' ×' : ''}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className="overflow-hidden transition-all duration-200 ease-out"
                      style={{ maxHeight: showArticles ? '12rem' : '0px' }}
                    >
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="space-y-1.5">
                          {articleLines.map((line, lineIndex) => (
                            <div
                              key={`${event.id}-${lineIndex}`}
                              className="flex items-start gap-2 text-xs text-txt-secondary"
                            >
                              <span className="mt-[6px] h-1 w-1 rounded-full bg-accent-blue" />
                              <span>{line}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
