import { useState, useEffect } from 'react'
import type { Signal } from '../types'
import { fetchSparkline } from '../api'
import Sparkline from './Sparkline'

interface Props {
  signal: Signal
  onTickerClick?: (ticker: string) => void
}

function confidenceGradient(c: number): React.CSSProperties {
  if (c >= 0.7) {
    return {
      background: 'linear-gradient(90deg, #00d68f, #00d68f)',
      boxShadow: '0 0 8px rgba(0, 214, 143, 0.4)',
    }
  }
  if (c >= 0.4) {
    return { background: 'linear-gradient(90deg, #ffab00, #00d68f)' }
  }
  return { background: 'linear-gradient(90deg, #ff3d5a, #ffab00)' }
}

export default function SignalCard({ signal, onTickerClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [sparklineData, setSparklineData] = useState<number[] | null>(null)
  const [sparklineLoading, setSparklineLoading] = useState(true)
  const isCall = signal.direction === 'call'
  const optionsMeta = signal.event?.metadata?.options_flow
  const technicalContext = signal.event?.metadata?.technical_context
  const edgarData = signal.event?.metadata?.edgar_data
  const hasUoa = signal.event?.event_type === 'options_flow' || Boolean(optionsMeta)
  const smartMoneyDirection = optionsMeta?.direction
  const hasSec = Boolean(edgarData)
  const articleIds = signal.event?.article_ids ?? []
  const hasArticles = articleIds.length > 0
  const isHighConviction = signal.confidence >= 0.7

  useEffect(() => {
    setSparklineLoading(true)
    fetchSparkline(signal.ticker)
      .then(data => {
        setSparklineData(data)
      })
      .catch(() => {})
      .finally(() => setSparklineLoading(false))
  }, [signal.ticker])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded(prev => !prev)}
      onKeyDown={e => e.key === 'Enter' && setExpanded(prev => !prev)}
      className={`card relative overflow-hidden border-l-[3px] cursor-pointer transition-all duration-200 ${
        isCall ? 'border-l-accent-green' : 'border-l-accent-red'
      } ${isHighConviction ? (isCall ? 'shadow-[inset_3px_0_12px_-4px_rgba(0,214,143,0.3)]' : 'shadow-[inset_3px_0_12px_-4px_rgba(255,61,90,0.3)]') : ''}`}
    >
      {/* Top row: ticker + direction */}
      <div className="flex items-start justify-between mb-4">
        <span
          className={`font-mono font-bold text-2xl tracking-tight ${onTickerClick ? 'text-accent-blue cursor-pointer hover:underline' : 'text-txt-primary'}`}
          onClick={e => {
            e.stopPropagation()
            onTickerClick?.(signal.ticker)
          }}
        >
          {signal.ticker}
        </span>
        <span className={`pill ${isCall ? 'bg-accent-green-muted text-accent-green' : 'bg-accent-red-muted text-accent-red'}`}>
          {isCall ? 'CALL' : 'PUT'}
        </span>
      </div>

      {/* Strike + Expiry */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-xl text-txt-primary">
          ${signal.suggested_strike?.toFixed(2) ?? '\u2014'}
        </span>
        <span className="text-txt-secondary text-[13px]">
          exp {signal.suggested_expiry ?? '\u2014'}
        </span>
      </div>

      {/* Sparkline */}
      <div className="mb-4 h-8 w-full">
        {sparklineLoading ? (
          <div className="skeleton h-8 w-full rounded" />
        ) : sparklineData && sparklineData.length >= 2 ? (
          <Sparkline
            data={sparklineData}
            height={32}
            color={isCall ? '#00d68f' : '#ff3d5a'}
          />
        ) : null}
      </div>

      {/* Gradient confidence bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-txt-secondary text-xs">Confidence</span>
          <span className="font-mono text-xs text-txt-secondary">
            {(signal.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-[5px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="confidence-bar h-full rounded-full"
            style={{
              width: `${signal.confidence * 100}%`,
              ...confidenceGradient(signal.confidence),
            }}
          />
        </div>
      </div>

      {technicalContext && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans ${
            technicalContext.rsi_signal === 'oversold' ? 'bg-accent-green-muted text-accent-green'
            : technicalContext.rsi_signal === 'overbought' ? 'bg-accent-red-muted text-accent-red'
            : 'bg-surface-tertiary text-txt-secondary'
          }`}>
            RSI {technicalContext.rsi.toFixed(0)} ({technicalContext.rsi_signal})
          </span>
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans ${
            technicalContext.macd_signal.includes('bullish') ? 'bg-accent-green-muted text-accent-green'
            : technicalContext.macd_signal.includes('bearish') ? 'bg-accent-red-muted text-accent-red'
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
          <StatusDot outcome={signal.outcome} />
          <span className={`text-[11px] font-mono font-bold tracking-wider uppercase transition-opacity duration-200 ${
            signal.outcome === 'profit' ? 'text-accent-green'
            : signal.outcome === 'loss' ? 'text-accent-red'
            : signal.outcome === 'expired' ? 'text-txt-tertiary'
            : 'text-accent-amber'
          }`}>
            {signal.outcome?.toUpperCase() ?? 'PENDING'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {signal.outcome_pnl != null && (
            <span className={`font-mono text-xs ${signal.outcome_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {signal.outcome_pnl >= 0 ? '+' : ''}{signal.outcome_pnl.toFixed(1)}%
            </span>
          )}
          <span className="text-txt-tertiary text-[11px] font-sans">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      {/* Expand chevron */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setExpanded(prev => !prev) }}
        className="absolute top-4 right-4 text-txt-tertiary hover:text-txt-primary transition-colors text-xs font-sans flex items-center gap-1"
        aria-expanded={expanded}
      >
        Details
        <span className={`inline-block transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          {'\u25BC'}
        </span>
      </button>

      {/* Expandable detail panel */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: expanded ? 600 : 0 }}
      >
        <div className="border-t border-border mt-4 pt-4 space-y-4">
          {/* Event trigger */}
          {signal.event && (
            <div>
              <h4 className="label mb-1">Event trigger</h4>
              <p className="text-txt-secondary text-xs font-sans">
                {signal.event.event_type.replace(/_/g, ' ')}
                {signal.event.detected_at && ` · Detected ${new Date(signal.event.detected_at).toLocaleString()}`}
              </p>
            </div>
          )}

          {/* Full technicals */}
          {technicalContext && (
            <div>
              <h4 className="label mb-2">Technicals</h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                <div className="flex justify-between"><span className="text-txt-tertiary">RSI</span><span className="text-txt-primary font-mono">{technicalContext.rsi.toFixed(0)} ({technicalContext.rsi_signal})</span></div>
                <div className="flex justify-between"><span className="text-txt-tertiary">MACD</span><span className="text-txt-primary">{technicalContext.macd_signal}</span></div>
                <div className="flex justify-between"><span className="text-txt-tertiary">Bollinger %B</span><span className="text-txt-primary font-mono">{technicalContext.bollinger_pct_b.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-txt-tertiary">Rel. volume</span><span className="text-txt-primary font-mono">{technicalContext.relative_volume.toFixed(2)}x</span></div>
              </div>
            </div>
          )}

          {/* Options flow */}
          {optionsMeta && (
            <div>
              <h4 className="label mb-2">Options flow</h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                {optionsMeta.dominant_expiry && <div className="flex justify-between"><span className="text-txt-tertiary">Dominant expiry</span><span className="text-txt-primary font-mono">{optionsMeta.dominant_expiry}</span></div>}
                {optionsMeta.dominant_strike != null && <div className="flex justify-between"><span className="text-txt-tertiary">Dominant strike</span><span className="text-txt-primary font-mono">${optionsMeta.dominant_strike}</span></div>}
                {optionsMeta.put_call_ratio != null && <div className="flex justify-between"><span className="text-txt-tertiary">Put/Call ratio</span><span className="text-txt-primary font-mono">{optionsMeta.put_call_ratio.toFixed(2)}</span></div>}
                {optionsMeta.max_conviction != null && <div className="flex justify-between"><span className="text-txt-tertiary">Max conviction</span><span className="text-txt-primary font-mono">{(optionsMeta.max_conviction * 100).toFixed(0)}%</span></div>}
              </div>
            </div>
          )}

          {/* SEC filings */}
          {edgarData && (
            <div>
              <h4 className="label mb-2">SEC filings</h4>
              <p className="text-txt-secondary text-xs font-sans mb-1">{edgarData.summary}</p>
              <div className="flex gap-3 text-[11px]">
                <span className="text-txt-tertiary">8K count: <span className="text-txt-primary font-mono">{edgarData['8k_analysis']?.recent_8k_count ?? 0}</span></span>
                <span className="text-txt-tertiary">Insider: <span className="text-txt-primary font-mono">{(edgarData.insider_analysis?.activity_level || 'normal').toUpperCase()}</span></span>
              </div>
            </div>
          )}

          {/* News articles */}
          {hasArticles && (
            <div>
              <h4 className="label mb-1">News</h4>
              <p className="text-txt-secondary text-xs font-sans">
                {articleIds.length} article{articleIds.length > 1 ? 's' : ''} detected.
                <span className="text-accent-blue cursor-pointer hover:underline ml-1">View articles</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusDot({ outcome }: { outcome: string | null }) {
  if (outcome === 'profit') {
    return <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-[checkPop_400ms_ease]" />
  }
  if (outcome === 'loss') {
    return <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-[xPop_400ms_ease]" />
  }
  if (outcome === 'expired') {
    return <span className="w-1.5 h-1.5 rounded-full bg-txt-tertiary" />
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
}
