import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchSparkline } from '../api'
import type { Signal } from '../types'
import Sparkline from './Sparkline'

interface Props {
  signal: Signal
  onTickerClick?: (ticker: string) => void
}

function confidenceGradient(c: number): string {
  if (c >= 0.7) return 'linear-gradient(90deg, #00d68f, #00d68f)'
  if (c >= 0.4) return 'linear-gradient(90deg, #ffab00, #00d68f)'
  return 'linear-gradient(90deg, #ff3d5a, #ffab00)'
}

export default function SignalCard({ signal, onTickerClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [sparklineData, setSparklineData] = useState<number[] | null>(null)
  const [sparklineLoading, setSparklineLoading] = useState(true)
  const [flashOutcome, setFlashOutcome] = useState<'profit' | 'loss' | null>(null)
  const previousOutcome = useRef<string | null>(signal.outcome)
  const isCall = signal.direction === 'call'
  const optionsMeta = signal.event?.metadata?.options_flow
  const technicalContext = signal.event?.metadata?.technical_context
  const hasUoa = signal.event?.event_type === 'options_flow' || Boolean(optionsMeta)
  const smartMoneyDirection = optionsMeta?.direction
  const edgarData = signal.event?.metadata?.edgar_data
  const hasSec = Boolean(edgarData)
  const articleCount = signal.event?.article_ids?.length ?? 0
  const confidencePct = Math.round(signal.confidence * 100)
  const confidenceFill = useMemo(() => confidenceGradient(signal.confidence), [signal.confidence])
  const cardShadow = isCall
    ? '0 4px 20px rgba(0, 214, 143, 0.08)'
    : '0 4px 20px rgba(255, 61, 90, 0.08)'

  useEffect(() => {
    let mounted = true
    setSparklineLoading(true)
    fetchSparkline(signal.ticker)
      .then((values) => {
        if (!mounted) return
        setSparklineData(values)
      })
      .catch(() => {
        if (!mounted) return
        setSparklineData(null)
      })
      .finally(() => {
        if (!mounted) return
        setSparklineLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [signal.ticker])

  useEffect(() => {
    if (previousOutcome.current !== signal.outcome) {
      if (signal.outcome === 'profit' || signal.outcome === 'loss') {
        setFlashOutcome(signal.outcome)
        window.setTimeout(() => setFlashOutcome(null), 900)
      }
      previousOutcome.current = signal.outcome
    }
  }, [signal.outcome])

  const handleCardToggle = () => setExpanded((prev) => !prev)
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardToggle()
    }
  }

  return (
    <div
      className={`card relative overflow-hidden border-l-[3px] ${isCall ? 'border-l-accent-green' : 'border-l-accent-red'} ${signal.confidence >= 0.7 ? 'animate-pulse-border' : ''}`}
      onClick={handleCardToggle}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      style={{
        boxShadow: signal.confidence >= 0.7 ? 'inset 3px 0 12px -4px rgba(0, 214, 143, 0.3)' : undefined,
      }}
      onMouseEnter={(event) => {
        ;(event.currentTarget as HTMLDivElement).style.boxShadow = cardShadow
      }}
      onMouseLeave={(event) => {
        ;(event.currentTarget as HTMLDivElement).style.boxShadow =
          signal.confidence >= 0.7 ? 'inset 3px 0 12px -4px rgba(0, 214, 143, 0.3)' : ''
      }}
    >
      {/* Top row: ticker + direction */}
      <div className="flex items-start justify-between mb-4">
        <span
          className={`font-mono font-bold text-2xl tracking-tight ${onTickerClick ? 'text-accent-blue cursor-pointer hover:underline' : 'text-txt-primary'}`}
          onClick={(event) => {
            event.stopPropagation()
            onTickerClick?.(signal.ticker)
          }}
        >
          {signal.ticker}
        </span>
        <span className={`pill ${isCall
          ? 'bg-accent-green-muted text-accent-green'
          : 'bg-accent-red-muted text-accent-red'
        }`}>
          {isCall ? 'CALL' : 'PUT'}
        </span>
      </div>

      {/* Strike + Expiry */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-xl text-txt-primary">
          ${signal.suggested_strike?.toFixed(2) ?? '\u2014'}
        </span>
        <span className="text-txt-secondary text-[13px]">
          exp {signal.suggested_expiry ?? '\u2014'}
        </span>
      </div>

      {sparklineLoading ? (
        <div className="skeleton h-8 w-full rounded mb-4" />
      ) : (
        sparklineData && sparklineData.length > 1 ? (
          <div className="mb-4">
            <Sparkline data={sparklineData} color={isCall ? '#00d68f' : '#ff3d5a'} />
          </div>
        ) : null
      )}

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-txt-secondary text-xs">Confidence</span>
          <span className="font-mono text-xs text-txt-secondary">
            {confidencePct}%
          </span>
        </div>
        <div className="h-[5px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="confidence-bar h-full rounded-full"
            style={{
              width: `${signal.confidence * 100}%`,
              background: confidenceFill,
              boxShadow: signal.confidence >= 0.7 ? '0 0 8px rgba(0, 214, 143, 0.4)' : undefined,
            }}
          />
        </div>
      </div>

      {technicalContext && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans ${
            technicalContext.rsi_signal === 'oversold'
              ? 'bg-accent-green-muted text-accent-green'
              : technicalContext.rsi_signal === 'overbought'
                ? 'bg-accent-red-muted text-accent-red'
                : 'bg-surface-tertiary text-txt-secondary'
          }`}>
            RSI {technicalContext.rsi.toFixed(0)} ({technicalContext.rsi_signal})
          </span>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans ${
            technicalContext.macd_signal.includes('bullish')
              ? 'bg-accent-green-muted text-accent-green'
              : technicalContext.macd_signal.includes('bearish')
                ? 'bg-accent-red-muted text-accent-red'
                : 'bg-surface-tertiary text-txt-secondary'
          }`}>
            MACD {technicalContext.macd_signal}
          </span>
          {technicalContext.relative_volume > 2 && (
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-sans bg-accent-blue/20 text-accent-blue">
              Vol {technicalContext.relative_volume.toFixed(2)}x
            </span>
          )}
        </div>
      )}

      {/* Event type + exploratory + discovery source */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {signal.event && (
          <span className="inline-block px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-secondary text-[11px] font-sans font-medium">
            {signal.event.event_type.replace(/_/g, ' ')}
          </span>
        )}
        {hasUoa && (
          <span className="inline-block px-2 py-0.5 rounded bg-accent-blue/20 text-accent-blue text-[10px] font-sans font-medium uppercase tracking-wider">
            UOA
          </span>
        )}
        {hasSec && (
          <span className="inline-block px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber text-[10px] font-sans font-medium uppercase tracking-wider">
            SEC
          </span>
        )}
        {signal.simulation_enhanced && (
          <span className="inline-block px-2 py-0.5 rounded bg-violet-500/20 text-violet-400 text-[10px] font-sans font-medium uppercase tracking-wider" title="Verified by MiroFish simulation">
            MiroFish
          </span>
        )}
        {signal.exploratory && (
          <span className="inline-block px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber text-[10px] font-sans font-medium uppercase tracking-wider">
            Exploratory
          </span>
        )}
        {signal.discovery_source && (
          <span className="inline-block px-2 py-0.5 rounded bg-surface-tertiary text-txt-tertiary text-[10px] font-sans">
            {signal.discovery_source === 'both' ? 'Discovered via news + volume' : signal.discovery_source === 'news_scanner' ? 'Discovered via news' : signal.discovery_source === 'volume_screener' ? 'Discovered via volume' : 'Manual'}
          </span>
        )}
        {smartMoneyDirection && (
          <span className="inline-block px-2 py-0.5 rounded bg-surface-tertiary text-txt-tertiary text-[10px] font-sans">
            Smart money: {smartMoneyDirection}
          </span>
        )}
      </div>

      {/* Outcome + P&L */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${
            signal.outcome === 'profit' ? 'bg-accent-green'
            : signal.outcome === 'loss' ? 'bg-accent-red'
            : signal.outcome === 'expired' ? 'bg-txt-tertiary'
            : 'bg-accent-amber animate-pulse'
          }`} />
          <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
            signal.outcome === 'profit' ? 'text-accent-green'
            : signal.outcome === 'loss' ? 'text-accent-red'
            : signal.outcome === 'expired' ? 'text-txt-tertiary'
            : 'text-accent-amber'
          } transition-opacity duration-200`}>
            {signal.outcome?.toUpperCase() ?? 'PENDING'}
          </span>
          {flashOutcome === 'profit' && <span className="text-accent-green text-xs animate-ping">✓</span>}
          {flashOutcome === 'loss' && <span className="text-accent-red text-xs animate-ping">✕</span>}
        </div>

        <div className="flex items-center gap-4">
          {signal.outcome_pnl != null && (
            <span className={`font-mono text-xs ${
              signal.outcome_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
            }`}>
              {signal.outcome_pnl >= 0 ? '+' : ''}{signal.outcome_pnl.toFixed(1)}%
            </span>
          )}
          <span className="text-txt-tertiary text-[11px] font-sans">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setExpanded((prev) => !prev)
        }}
        className="mt-3 text-xs text-txt-secondary hover:text-txt-primary transition-colors inline-flex items-center gap-1"
      >
        Details
        <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: expanded ? '420px' : '0px' }}
      >
        <div className="border-t border-border mt-4 pt-4 space-y-3">
          <div className="text-xs text-txt-secondary">
            <span className="text-txt-tertiary">Event trigger: </span>
            {signal.event?.event_type?.replace(/_/g, ' ') ?? '—'}
            {signal.event?.detected_at && (
              <span className="ml-2 text-txt-tertiary">
                {new Date(signal.event.detected_at).toLocaleString()}
              </span>
            )}
          </div>

          {technicalContext && (
            <div className="space-y-1.5 text-xs">
              <DetailRow label="RSI" value={`${technicalContext.rsi.toFixed(1)} (${technicalContext.rsi_signal})`} />
              <DetailRow label="MACD" value={technicalContext.macd_signal} />
              <DetailRow label="Bollinger" value={technicalContext.bollinger_signal} />
              <DetailRow label="Relative Volume" value={`${technicalContext.relative_volume.toFixed(2)}x`} />
            </div>
          )}

          {optionsMeta && (
            <div className="space-y-1.5 text-xs">
              <DetailRow label="Dominant expiry" value={optionsMeta.dominant_expiry ?? '—'} />
              <DetailRow label="Dominant strike" value={optionsMeta.dominant_strike != null ? `$${optionsMeta.dominant_strike}` : '—'} />
              <DetailRow label="Put/Call ratio" value={optionsMeta.put_call_ratio != null ? optionsMeta.put_call_ratio.toFixed(2) : '—'} />
              <DetailRow label="Max conviction" value={optionsMeta.max_conviction != null ? `${Math.round(optionsMeta.max_conviction * 100)}%` : '—'} />
            </div>
          )}

          {edgarData && (
            <div className="space-y-1.5 text-xs">
              <DetailRow label="SEC summary" value={edgarData.summary} />
              <DetailRow label="8-K count" value={String(edgarData['8k_analysis']?.recent_8k_count ?? 0)} />
              <DetailRow label="Insider activity" value={edgarData.insider_analysis?.activity_level ?? 'normal'} />
            </div>
          )}

          {articleCount > 0 && (
            <div className="text-xs text-txt-secondary">
              {articleCount} article{articleCount > 1 ? 's' : ''} detected ·{' '}
              <span className="text-accent-blue">View articles</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-txt-tertiary">{label}</span>
      <span className="text-txt-secondary text-right">{value}</span>
    </div>
  )
}
