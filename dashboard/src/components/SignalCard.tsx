import { useState, useEffect } from 'react'
import type { Signal } from '../types'
import { fetchSparkline } from '../api'
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
  const isCall = signal.direction === 'call'
  const optionsMeta = signal.event?.metadata?.options_flow
  const technicalContext = signal.event?.metadata?.technical_context
  const edgarData = signal.event?.metadata?.edgar_data
  const hasUoa = signal.event?.event_type === 'options_flow' || Boolean(optionsMeta)
  const smartMoneyDirection = optionsMeta?.direction
  const hasSec = Boolean(edgarData)
  const highConviction = signal.confidence >= 0.7

  const [expanded, setExpanded] = useState(false)
  const [sparkData, setSparkData] = useState<number[] | null>(null)
  const [sparkLoading, setSparkLoading] = useState(true)

  useEffect(() => {
    setSparkLoading(true)
    fetchSparkline(signal.ticker)
      .then(setSparkData)
      .catch(() => setSparkData(null))
      .finally(() => setSparkLoading(false))
  }, [signal.ticker])

  const cardClasses = [
    'card relative overflow-hidden border-l-[3px] cursor-pointer',
    isCall ? 'border-l-accent-green signal-card-call' : 'border-l-accent-red signal-card-put',
    highConviction ? 'animate-pulse-border' : '',
  ].join(' ')

  const highConvictionShadow = highConviction
    ? { boxShadow: 'inset 3px 0 12px -4px rgba(0, 214, 143, 0.3)' }
    : undefined

  return (
    <div
      className={cardClasses}
      style={highConvictionShadow}
      onClick={() => setExpanded(v => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
    >
      {/* Top row: ticker + direction */}
      <div className="flex items-start justify-between mb-4">
        <span
          className={`font-mono font-bold text-2xl tracking-tight ${onTickerClick ? 'text-accent-blue cursor-pointer hover:underline' : 'text-txt-primary'}`}
          onClick={e => { if (onTickerClick) { e.stopPropagation(); onTickerClick(signal.ticker) } }}
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

      {/* Sparkline */}
      {sparkLoading ? (
        <div className="skeleton h-8 w-full rounded mb-4" />
      ) : sparkData && sparkData.length >= 2 ? (
        <div className="mb-4">
          <Sparkline
            data={sparkData}
            height={32}
            color={isCall ? '#00d68f' : '#ff3d5a'}
          />
        </div>
      ) : null}

      {/* Confidence bar */}
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
              background: confidenceGradient(signal.confidence),
              boxShadow: highConviction ? '0 0 8px rgba(0, 214, 143, 0.4)' : undefined,
              borderRadius: '9999px',
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

      {/* Expandable detail panel */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: expanded ? '600px' : '0px' }}
      >
        <div className="border-t border-border mt-4 pt-4 space-y-3">
          {/* Event trigger */}
          {signal.event && (
            <div className="text-xs">
              <span className="text-txt-tertiary">Event: </span>
              <span className="text-txt-secondary">{signal.event.event_type.replace(/_/g, ' ')}</span>
              {signal.event.detected_at && (
                <span className="text-txt-tertiary ml-2">
                  Detected {new Date(signal.event.detected_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Full technicals */}
          {technicalContext && (
            <div className="space-y-1.5">
              <p className="text-txt-tertiary text-[10px] uppercase tracking-wider font-sans">Technicals</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                <div><span className="text-txt-tertiary">RSI: </span><span className="text-txt-secondary">{technicalContext.rsi.toFixed(1)} ({technicalContext.rsi_signal})</span></div>
                <div><span className="text-txt-tertiary">MACD: </span><span className="text-txt-secondary">{technicalContext.macd_signal}</span></div>
                <div><span className="text-txt-tertiary">Bollinger: </span><span className="text-txt-secondary">{technicalContext.bollinger_pct_b?.toFixed(2) ?? '\u2014'} ({technicalContext.bollinger_signal})</span></div>
                <div><span className="text-txt-tertiary">Rel Volume: </span><span className="text-txt-secondary">{technicalContext.relative_volume.toFixed(2)}x</span></div>
              </div>
            </div>
          )}

          {/* Options flow */}
          {optionsMeta && (
            <div className="space-y-1.5">
              <p className="text-txt-tertiary text-[10px] uppercase tracking-wider font-sans">Options Flow</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                {optionsMeta.dominant_expiry && <div><span className="text-txt-tertiary">Expiry: </span><span className="text-txt-secondary">{optionsMeta.dominant_expiry}</span></div>}
                {optionsMeta.dominant_strike != null && <div><span className="text-txt-tertiary">Strike: </span><span className="text-txt-secondary">${optionsMeta.dominant_strike}</span></div>}
                {optionsMeta.put_call_ratio != null && <div><span className="text-txt-tertiary">P/C: </span><span className="text-txt-secondary">{optionsMeta.put_call_ratio.toFixed(2)}</span></div>}
                {optionsMeta.max_conviction != null && <div><span className="text-txt-tertiary">Max Conv: </span><span className="text-txt-secondary">{(optionsMeta.max_conviction * 100).toFixed(0)}%</span></div>}
              </div>
            </div>
          )}

          {/* SEC filings */}
          {edgarData && (
            <div className="space-y-1.5">
              <p className="text-txt-tertiary text-[10px] uppercase tracking-wider font-sans">SEC Filings</p>
              <p className="text-xs text-txt-secondary">{edgarData.summary}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                <div><span className="text-txt-tertiary">8-K: </span><span className="text-txt-secondary">{edgarData['8k_analysis']?.recent_8k_count ?? 0} filings</span></div>
                <div><span className="text-txt-tertiary">Insider: </span><span className="text-txt-secondary">{edgarData.insider_analysis?.activity_level ?? 'normal'}</span></div>
              </div>
            </div>
          )}

          {/* News articles */}
          {signal.event?.article_ids && signal.event.article_ids.length > 0 && (
            <div className="text-xs text-txt-secondary">
              {signal.event.article_ids.length} article{signal.event.article_ids.length !== 1 ? 's' : ''} detected
            </div>
          )}
        </div>
      </div>

      {/* Outcome + P&L */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          {signal.outcome === 'profit' ? (
            <span className="w-2 h-2 text-accent-green animate-green-flash">{'\u2713'}</span>
          ) : signal.outcome === 'loss' ? (
            <span className="w-2 h-2 text-accent-red animate-red-flash">{'\u2717'}</span>
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${
              signal.outcome === 'expired' ? 'bg-txt-tertiary'
              : 'bg-accent-amber animate-pulse'
            }`} />
          )}
          <span className={`text-[11px] font-mono font-bold tracking-wider uppercase ${
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
            <span className={`font-mono text-xs ${
              signal.outcome_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'
            }`}>
              {signal.outcome_pnl >= 0 ? '+' : ''}{signal.outcome_pnl.toFixed(1)}%
            </span>
          )}
          <span className="text-txt-tertiary text-[11px] font-sans">
            {signal.created_at ? new Date(signal.created_at).toLocaleDateString() : ''}
          </span>
          <span
            className={`text-txt-tertiary text-xs transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            {'\u25BE'}
          </span>
        </div>
      </div>
    </div>
  )
}
