import { useState, useEffect, useRef, useMemo } from 'react'
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

interface Props {
  onTickerClick?: (ticker: string) => void
}

export default function EventTimeline({ onTickerClick }: Props = {}) {
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticker, setTicker] = usePersistedState('options-events-ticker', '')
  const [keywordFilter, setKeywordFilter] = useState<string | null>(null)
  const [expandedArticles, setExpandedArticles] = useState<Record<string, boolean>>({})
  const lastEventIdsRef = useRef<Set<string>>(new Set())
  const { addToast } = useToast()
  const addToastRef = useRef(addToast)
  addToastRef.current = addToast

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchEvents({ ticker: ticker || undefined, limit: 50 })
      .then((nextEvents) => {
        setEvents(nextEvents)
        if (lastEventIdsRef.current.size > 0) {
          const newEvents = nextEvents.filter((event) => !lastEventIdsRef.current.has(event.id))
          newEvents.forEach((event) => {
            addToastRef.current(
              'event',
              `New Event: ${event.ticker} ${event.event_type.replace(/_/g, ' ')}`,
              `${Math.round(event.confidence * 100)}% confidence`
            )
          })
        }
        lastEventIdsRef.current = new Set(nextEvents.map((event) => event.id))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!keywordFilter) return true
        const meta = event.metadata as Record<string, unknown> | null
        const themes = ((meta?.common_themes as string[] | undefined) ?? []).map((theme) =>
          theme.toLowerCase()
        )
        return themes.includes(keywordFilter.toLowerCase())
      }),
    [events, keywordFilter]
  )
  const { visibleItems, getDelay, ready } = useStaggeredList(filteredEvents)

  const toggleArticles = (eventId: string) => {
    setExpandedArticles((prev) => ({ ...prev, [eventId]: !prev[eventId] }))
  }

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
          data-ticker-search="true"
          className="w-28 bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
        />
      </div>

      {keywordFilter && (
        <div className="mb-4">
          <button
            onClick={() => setKeywordFilter(null)}
            className="pill bg-surface-secondary text-txt-secondary hover:text-txt-primary"
          >
            Filtered by: {keywordFilter} <span className="ml-1">✕</span>
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
            <div key={i} className="ml-6">
              <SkeletonEventCard />
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No events detected.</p>
          <p className="text-txt-tertiary text-xs">The market is quiet — or your thresholds are working perfectly.</p>
        </div>
      ) : (
        <div className="relative ml-3">
          {/* Vertical line */}
          <div className="timeline-gradient-line absolute left-[3px] top-2 bottom-2 w-[2px]" />

          <div className={`stagger-container ${ready ? 'is-ready' : ''}`}>
          {visibleItems.map((ev, index) => {
            const meta = ev.metadata as Record<string, unknown> | null
            const themes = (meta?.common_themes as string[]) ?? []
            const articleCount = ev.article_ids?.length ?? 0
            const badge = EVENT_BADGE[ev.event_type] ?? { bg: 'bg-surface-tertiary', text: 'text-txt-secondary' }
            const isRecent = Boolean(ev.detected_at) && (Date.now() - new Date(ev.detected_at ?? '').getTime() < 30 * 60 * 1000)
            const confidencePct = Math.round(ev.confidence * 100)
            const isArticlesOpen = Boolean(expandedArticles[ev.id])
            const articleThemes = themes.length > 0
              ? themes
              : articleCount > 0
                ? ['Articles detected']
                : []
            let sentimentGradient = 'linear-gradient(90deg, #ff3d5a, #ffab00)'
            if (ev.confidence >= 0.7) sentimentGradient = 'linear-gradient(90deg, #00d68f, #00d68f)'
            else if (ev.confidence >= 0.4) sentimentGradient = 'linear-gradient(90deg, #ffab00, #00d68f)'

            return (
              <div
                key={ev.id}
                className="stagger-item relative pl-8 pb-6 group"
                style={{ animationDelay: getDelay(index) }}
              >
                {/* Timeline dot */}
                <div className={`absolute left-0 top-3 w-2 h-2 rounded-full ring-[3px] ring-surface-tertiary ${DOT_COLOR[ev.direction] ?? 'bg-txt-tertiary'} ${isRecent ? 'animate-pulse' : ''}`} />

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
                    <div className="ml-auto flex items-center gap-2" title={`Confidence: ${confidencePct}% — This event's sentiment certainty score`}>
                      <span className="font-mono text-xs text-txt-tertiary">{confidencePct}%</span>
                      <div className="h-1 w-10 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full confidence-bar" style={{ width: `${confidencePct}%`, background: sentimentGradient }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-txt-tertiary text-[11px] font-sans">
                    {ev.detected_at && <span>{relativeTime(ev.detected_at)}</span>}
                    {articleCount > 0 && (
                      <button
                        onClick={() => toggleArticles(ev.id)}
                        className="cursor-pointer hover:text-accent-blue transition-colors"
                      >
                        {articleCount} article{articleCount > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>

                  {themes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {themes.slice(0, 5).map((t, i) => (
                        <button
                          key={`${ev.id}-${t}-${i}`}
                          onClick={() => setKeywordFilter(t)}
                          className="px-2 py-0.5 rounded bg-surface-tertiary hover:bg-surface-primary text-txt-tertiary text-[11px] font-sans cursor-pointer transition-all"
                        >
                          {t}
                          {keywordFilter?.toLowerCase() === t.toLowerCase() && <span className="ml-1">×</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    className="overflow-hidden transition-all duration-200 ease-out"
                    style={{ maxHeight: isArticlesOpen ? '140px' : '0px' }}
                  >
                    <div className="mt-3 border-t border-border pt-3 space-y-1.5">
                      {articleThemes.map((theme, idx) => (
                        <div key={`${ev.id}-theme-${idx}`} className="text-xs text-txt-secondary flex items-start gap-2">
                          <span className="text-txt-tertiary">•</span>
                          <span>{theme}</span>
                        </div>
                      ))}
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
