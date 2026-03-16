import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchSparkline } from '../api'
import type { Signal } from '../types'
import Sparkline from './Sparkline'

interface Props {
  signal: Signal
  onTickerClick?: (ticker: string) => void
}

function getDiscoverySourceLabel(source: Signal['discovery_source']) {
  if (source === 'both') return 'Discovered via news + volume'
  if (source === 'news_scanner') return 'Discovered via news'
  if (source === 'volume_screener') return 'Discovered via volume'
  if (source) return 'Manual'
  return null
}

function getConfidenceGradient(confidence: number) {
  if (confidence >= 0.7) {
    return 'linear-gradient(90deg, #00d68f, #00d68f)'
  }
  if (confidence >= 0.4) {
    return 'linear-gradient(90deg, #ffab00, #00d68f)'
  }
  return 'linear-gradient(90deg, #ff3d5a, #ffab00)'
}

function formatDetectedAt(value: string | null | undefined) {
  if (!value) return 'Detection time unavailable'
  return new Date(value).toLocaleString()
}

export default function SignalCard({ signal, onTickerClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [sparkline, setSparkline] = useState<number[] | null>(null)
  const [sparklineLoading, setSparklineLoading] = useState(true)
  const [statusFlash, setStatusFlash] = useState<'profit' | 'loss' | null>(null)
  const previousOutcomeRef = useRef(signal.outcome)

  const isCall = signal.direction === 'call'
  const optionsMeta = signal.event?.metadata?.options_flow
  const technicalContext = signal.event?.metadata?.technical_context
  const edgarData = signal.event?.metadata?.edgar_data
  const hasUoa = signal.event?.event_type === 'options_flow' || Boolean(optionsMeta)
  const smartMoneyDirection = optionsMeta?.direction
  const hasSec = Boolean(edgarData)
  const isHighConviction = signal.confidence >= 0.7
  const confidenceGradient = getConfidenceGradient(signal.confidence)
  const sparklineColor = isCall ? '#00d68f' : '#ff3d5a'
  const statusIcon =
    signal.outcome === 'profit'
      ? '✓'
      : signal.outcome === 'loss'
        ? '×'
        : signal.outcome === 'expired'
          ? '•'
          : '•'

  useEffect(() => {
    let cancelled = false
    setSparklineLoading(true)
    setSparkline(null)

    fetchSparkline(signal.ticker)
      .then((data) => {
        if (!cancelled) {
          setSparkline(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSparkline(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSparklineLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [signal.ticker])

  useEffect(() => {
    if (previousOutcomeRef.current !== signal.outcome) {
      if (signal.outcome === 'profit' || signal.outcome === 'loss') {
        setStatusFlash(signal.outcome)
        const timeoutId = window.setTimeout(() => setStatusFlash(null), 500)
        previousOutcomeRef.current = signal.outcome
        return () => window.clearTimeout(timeoutId)
      }
      previousOutcomeRef.current = signal.outcome
    }

    previousOutcomeRef.current = signal.outcome
    return undefined
  }, [signal.outcome])

  const technicalRows = useMemo(() => {
    if (!technicalContext) return []
    return [
      {
        label: 'RSI',
        value: `${technicalContext.rsi.toFixed(1)} · ${technicalContext.rsi_signal}`,
      },
      {
        label: 'MACD',
        value: technicalContext.macd_signal,
      },
      {
        label: 'Bollinger',
        value: `${technicalContext.bollinger_signal} · ${(technicalContext.bollinger_pct_b * 100).toFixed(0)}% band position`,
      },
      {
        label: 'Rel Vol',
        value: `${technicalContext.relative_volume.toFixed(2)}x`,
      },
    ]
  }, [technicalContext])

  const discoverySourceLabel = getDiscoverySourceLabel(signal.discovery_source)

  return (
    <div
      className={`card relative overflow-hidden border-l-[3px] ${
        isCall ? 'card-signal-call border-l-accent-green' : 'card-signal-put border-l-accent-red'
      }`}
      style={
        isHighConviction
          ? {
              boxShadow: 'inset 3px 0 12px -4px rgba(0, 214, 143, 0.3)',
            }
          : undefined
      }
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setExpanded((current) => !current)
        }
      }}
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className={`font-mono text-2xl font-bold tracking-tight ${
            onTickerClick ? 'cursor-pointer text-accent-blue hover:underline' : 'text-txt-primary'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onTickerClick?.(signal.ticker)
          }}
        >
          {signal.ticker}
        </span>
        <span className={`pill ${isCall ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'}`}>
          {isCall ? 'CALL' : 'PUT'}
        </span>
      </div>

      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-xl text-txt-primary">${signal.suggested_strike?.toFixed(2) ?? '\u2014'}</span>
        <span className="text-[13px] text-txt-secondary">exp {signal.suggested_expiry ?? '\u2014'}</span>
      </div>

      <div className="mb-4">
        {sparklineLoading ? (
          <div className="skeleton h-8 w-full rounded" />
        ) : sparkline && sparkline.length > 1 ? (
          <Sparkline data={sparkline} color={sparklineColor} />
        ) : null}
      </div>

      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-txt-secondary">Confidence</span>
          <span className="font-mono text-xs text-txt-secondary">{(signal.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="h-[5px] w-full rounded-full bg-white/5">
          <div
            className="confidence-bar h-full rounded-full"
            style={{
              width: `${signal.confidence * 100}%`,
              background: confidenceGradient,
              boxShadow: isHighConviction ? '0 0 8px rgba(0, 214, 143, 0.4)' : 'none',
            }}
          />
        </div>
      </div>

      {technicalContext && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded px-2 py-0.5 text-[10px] ${
              technicalContext.rsi_signal === 'oversold'
                ? 'bg-accent-green-muted text-accent-green'
                : technicalContext.rsi_signal === 'overbought'
                  ? 'bg-accent-red-muted text-accent-red'
                  : 'bg-surface-tertiary text-txt-secondary'
            }`}
          >
            RSI {technicalContext.rsi.toFixed(0)} ({technicalContext.rsi_signal})
          </span>
          <span
            className={`rounded px-2 py-0.5 text-[10px] ${
              technicalContext.macd_signal.includes('bullish')
                ? 'bg-accent-green-muted text-accent-green'
                : technicalContext.macd_signal.includes('bearish')
                  ? 'bg-accent-red-muted text-accent-red'
                  : 'bg-surface-tertiary text-txt-secondary'
            }`}
          >
            MACD {technicalContext.macd_signal}
          </span>
          {technicalContext.relative_volume > 2 && (
            <span className="rounded bg-accent-blue/20 px-2 py-0.5 text-[10px] text-accent-blue">
              Vol {technicalContext.relative_volume.toFixed(2)}x
            </span>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {signal.event && (
          <span className="rounded-md bg-surface-tertiary px-2.5 py-1 text-[11px] font-medium text-txt-secondary">
            {signal.event.event_type.replace(/_/g, ' ')}
          </span>
        )}
        {hasUoa && (
          <span className="rounded bg-accent-blue/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-blue">
            UOA
          </span>
        )}
        {hasSec && (
          <span className="rounded bg-accent-amber/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-amber">
            SEC
          </span>
        )}
        {signal.exploratory && (
          <span className="rounded bg-accent-amber/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-amber">
            Exploratory
          </span>
        )}
        {discoverySourceLabel && (
          <span className="rounded bg-surface-tertiary px-2 py-0.5 text-[10px] text-txt-tertiary">
            {discoverySourceLabel}
          </span>
        )}
        {smartMoneyDirection && (
          <span className="rounded bg-surface-tertiary px-2 py-0.5 text-[10px] text-txt-tertiary">
            Smart money: {smartMoneyDirection}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
              signal.outcome === 'profit'
                ? `bg-accent-green-muted text-accent-green ${statusFlash === 'profit' ? 'status-flash-profit' : ''}`
                : signal.outcome === 'loss'
                  ? `bg-accent-red-muted text-accent-red ${statusFlash === 'loss' ? 'status-flash-loss' : ''}`
                  : signal.outcome === 'expired'
                    ? 'bg-surface-tertiary text-txt-tertiary'
                    : 'animate-pulse bg-accent-amber-muted text-accent-amber'
            }`}
          >
            {statusIcon}
          </span>
          <span
            className={`text-[11px] font-mono font-bold uppercase tracking-wider transition-opacity duration-200 ${
              signal.outcome === 'profit'
                ? 'text-accent-green'
                : signal.outcome === 'loss'
                  ? 'text-accent-red'
                  : signal.outcome === 'expired'
                    ? 'text-txt-tertiary'
                    : 'text-accent-amber'
            }`}
          >
            {signal.outcome?.toUpperCase() ?? 'PENDING'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {signal.outcome_pnl != null && (
            <span className={`font-mono text-xs ${signal.outcome_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {signal.outcome_pnl >= 0 ? '+' : ''}
              {signal.outcome_pnl.toFixed(1)}%
            </span>
          )}
          <span className="text-[11px] text-txt-tertiary">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setExpanded((current) => !current)
            }}
            className="flex items-center gap-1 text-[11px] text-txt-secondary transition-colors hover:text-txt-primary"
            aria-expanded={expanded}
          >
            Details
            <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>⌄</span>
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: expanded ? '32rem' : '0px' }}
      >
        <div className="mt-4 border-t border-border pt-4">
          <div className="space-y-3 text-xs">
            <DetailRow
              label="Event trigger"
              value={`${signal.event?.event_type.replace(/_/g, ' ') ?? 'Unknown event'} · ${formatDetectedAt(
                signal.event?.detected_at
              )}`}
            />

            {technicalRows.map((row) => (
              <DetailRow key={row.label} label={row.label} value={row.value} />
            ))}

            {optionsMeta && (
              <>
                <DetailRow label="Options flow expiry" value={optionsMeta.dominant_expiry ?? '—'} />
                <DetailRow
                  label="Options flow strike"
                  value={optionsMeta.dominant_strike != null ? `$${optionsMeta.dominant_strike.toFixed(2)}` : '—'}
                />
                <DetailRow
                  label="Put/Call ratio"
                  value={optionsMeta.put_call_ratio != null ? optionsMeta.put_call_ratio.toFixed(2) : '—'}
                />
                <DetailRow
                  label="Max conviction"
                  value={optionsMeta.max_conviction != null ? `${Math.round(optionsMeta.max_conviction * 100)}%` : '—'}
                />
              </>
            )}

            {edgarData && (
              <>
                <DetailRow label="SEC summary" value={edgarData.summary} />
                <DetailRow
                  label="8-K filings"
                  value={`${edgarData['8k_analysis']?.recent_8k_count ?? 0} recent`}
                />
                <DetailRow
                  label="Insider activity"
                  value={edgarData.insider_analysis?.activity_level ?? 'normal'}
                />
              </>
            )}

            {signal.event?.article_ids?.length ? (
              <DetailRow
                label="News articles"
                value={
                  <span className="inline-flex items-center gap-2">
                    <span>{signal.event.article_ids.length} detected</span>
                    <span className="text-accent-blue">View articles</span>
                  </span>
                }
              />
            ) : null}

            {!technicalRows.length && !optionsMeta && !edgarData && !(signal.event?.article_ids?.length) && (
              <p className="text-txt-tertiary">No additional context is available for this signal yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-tertiary px-3 py-2">
      <span className="text-txt-tertiary">{label}</span>
      <span className="max-w-[65%] text-right text-txt-secondary">{value}</span>
    </div>
  )
}
