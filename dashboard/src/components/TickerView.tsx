import { useState, useEffect } from 'react'
import { fetchTickers, fetchChartData, fetchCompanyInfo, fetchKeyStats, fetchOptionsFlow, fetchIndicators, fetchEdgar, fetchSparkline } from '../api'
import type {
  TickerSummary,
  ChartData,
  CompanyInfo,
  KeyStats,
  OptionsFlowResult,
  TechnicalIndicators,
  EdgarResult,
} from '../types'

function TickerCard({ ticker, onClick }: { ticker: TickerSummary; onClick: () => void }) {
  const [sparklineData, setSparklineData] = useState<number[] | null>(null)
  const [info, setInfo] = useState<CompanyInfo | null>(null)
  useEffect(() => {
    fetchSparkline(ticker.ticker).then(setSparklineData).catch(() => {})
    fetchCompanyInfo(ticker.ticker).then(setInfo).catch(() => {})
  }, [ticker.ticker])
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left card transition-all duration-150 hover:border-border-hover"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="font-mono font-bold text-xl text-txt-primary">{ticker.ticker}</div>
        {info?.current_price != null && (
          <span className="font-mono text-sm text-txt-primary">
            ${info.current_price.toFixed(2)}
            {info.change_percent != null && (
              <span className={info.change_percent >= 0 ? 'text-accent-green ml-1' : 'text-accent-red ml-1'}>
                {info.change_percent >= 0 ? '+' : ''}{info.change_percent.toFixed(2)}%
              </span>
            )}
          </span>
        )}
      </div>
      <div className="h-8 mb-3">
        {sparklineData && sparklineData.length >= 2 ? (
          <Sparkline data={sparklineData} height={32} color="#448aff" />
        ) : (
          <div className="skeleton h-8 w-full rounded" />
        )}
      </div>
      <div className="space-y-1.5 text-xs font-sans">
        <div className="flex justify-between">
          <span className="text-txt-tertiary">Signals</span>
          <span className="font-mono text-txt-primary">{ticker.total_signals}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-tertiary">Win rate</span>
          <span className={`font-mono ${ticker.win_rate >= 0.5 ? 'text-accent-green' : ticker.win_rate > 0 ? 'text-accent-red' : 'text-txt-secondary'}`}>
            {(ticker.win_rate * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-txt-tertiary">Last signal</span>
          <span className="font-mono text-txt-tertiary text-[11px]">
            {ticker.last_signal_date ? new Date(ticker.last_signal_date).toLocaleDateString() : '\u2014'}
          </span>
        </div>
      </div>
    </button>
  )
}
import StockHeader from './StockHeader'
import PriceChart from './PriceChart'
import StatsGrid from './StatsGrid'
import SignalHistory from './SignalHistory'
import Sparkline from './Sparkline'

interface TickerViewProps {
  initialTicker?: string | null
  onNavigated?: () => void
}

export default function TickerView({ initialTicker, onNavigated }: TickerViewProps = {}) {
  const [tickers, setTickers] = useState<TickerSummary[]>([])
  const [selected, setSelected] = useState<string | null>(initialTicker ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Detail view state
  const [info, setInfo] = useState<CompanyInfo | null>(null)
  const [stats, setStats] = useState<KeyStats | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [optionsFlow, setOptionsFlow] = useState<OptionsFlowResult | null>(null)
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null)
  const [edgarData, setEdgarData] = useState<EdgarResult | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [period, setPeriod] = useState('6mo')

  useEffect(() => {
    if (initialTicker) {
      setSelected(initialTicker)
      onNavigated?.()
    }
  }, [initialTicker, onNavigated])

  useEffect(() => {
    fetchTickers()
      .then(setTickers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) {
      setInfo(null)
      setStats(null)
      setChartData(null)
      setOptionsFlow(null)
      setIndicators(null)
      setEdgarData(null)
      return
    }
    setDetailLoading(true)
    setError(null)
    Promise.all([
      fetchCompanyInfo(selected),
      fetchKeyStats(selected),
      fetchChartData(selected, period),
      fetchOptionsFlow(selected),
      fetchIndicators(selected),
      fetchEdgar(selected),
    ])
      .then(([i, s, c, o, ind, edgar]) => {
        setInfo(i)
        setStats(s)
        setChartData(c)
        setOptionsFlow(o)
        setIndicators(ind ?? c.indicators ?? null)
        setEdgarData(edgar)
      })
      .catch(e => setError(e.message))
      .finally(() => setDetailLoading(false))
  }, [selected, period])

  if (loading) return (
    <div>
      <div className="skeleton h-8 w-40 mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28" />)}
      </div>
    </div>
  )

  if (error && !selected) return (
    <div className="card border-accent-red/30 bg-accent-red-muted">
      <p className="text-accent-red text-sm">{error}</p>
    </div>
  )

  // ── Detail view ──────────────────────────────────────────────
  if (selected) {
    if (detailLoading) return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-20" />
        <div className="skeleton h-80" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}
        </div>
      </div>
    )

    return (
      <div className="animate-fade-in space-y-6">
        {info && (
          <StockHeader info={info} onBack={() => setSelected(null)} />
        )}

        {error && (
          <div className="card border-accent-red/30 bg-accent-red-muted">
            <p className="text-accent-red text-sm">{error}</p>
          </div>
        )}

        {chartData && (
          <PriceChart
            prices={chartData.prices}
            signals={chartData.signals}
            events={chartData.events}
            period={period}
            onPeriodChange={setPeriod}
          />
        )}

        {stats && <StatsGrid stats={stats} />}

        {indicators && (
          <div className="card">
            <h3 className="font-mono font-bold text-sm text-txt-primary mb-4">Technical Indicators</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary mb-1">RSI (14)</div>
                <div className="font-mono text-base text-txt-primary">{indicators.rsi_14.toFixed(1)}</div>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] ${
                  indicators.rsi_signal === 'oversold'
                    ? 'bg-accent-green-muted text-accent-green'
                    : indicators.rsi_signal === 'overbought'
                      ? 'bg-accent-red-muted text-accent-red'
                      : 'bg-surface-secondary text-txt-secondary'
                }`}>
                  {indicators.rsi_signal}
                </span>
              </div>

              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary mb-1">Bollinger %B</div>
                <div className="font-mono text-base text-txt-primary">{indicators.bollinger_pct_b.toFixed(2)}</div>
                <div className="relative mt-2 h-1 rounded-full bg-surface-secondary">
                  <div
                    className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent-blue"
                    style={{ left: `${Math.max(0, Math.min(100, indicators.bollinger_pct_b * 100))}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
              </div>

              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary mb-1">ATR (14)</div>
                <div className="font-mono text-base text-txt-primary">${indicators.atr_14.toFixed(2)}</div>
                <div className="font-mono text-[11px] text-txt-secondary">{indicators.atr_pct.toFixed(1)}%</div>
              </div>

              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary mb-1">MACD</div>
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                  indicators.macd_signal.includes('bullish')
                    ? 'bg-accent-green-muted text-accent-green'
                    : indicators.macd_signal.includes('bearish')
                      ? 'bg-accent-red-muted text-accent-red'
                      : 'bg-surface-secondary text-txt-secondary'
                }`}>
                  {indicators.macd_signal}
                </span>
              </div>

              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary mb-1">Relative Volume</div>
                <div className="font-mono text-base text-txt-primary">{indicators.relative_volume.toFixed(2)}x</div>
                {indicators.relative_volume > 2.0 && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-accent-blue/20 text-accent-blue">
                    High Volume
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {edgarData?.significant_findings && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono font-bold text-sm text-txt-primary">SEC Filings</h3>
              <span className={`pill ${
                edgarData.combined_direction === 'bearish'
                  ? 'bg-accent-red-muted text-accent-red'
                  : edgarData.combined_direction === 'bullish'
                    ? 'bg-accent-green-muted text-accent-green'
                    : 'bg-surface-tertiary text-txt-secondary'
              }`}>
                {edgarData.combined_direction.toUpperCase()}
              </span>
            </div>

            <p className="text-xs text-txt-secondary mb-3">{edgarData.summary}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">8-K filings (3d)</div>
                <div className="font-mono text-base text-txt-primary">
                  {edgarData["8k_analysis"]?.recent_8k_count ?? 0}
                </div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Form 4 filings (7d)</div>
                <div className="font-mono text-base text-txt-primary">
                  {edgarData.insider_analysis?.total_form4s ?? 0}
                </div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Insider activity</div>
                <div className="font-mono text-base text-txt-primary">
                  {(edgarData.insider_analysis?.activity_level || 'normal').toUpperCase()}
                </div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Most significant item</div>
                <div className="font-mono text-base text-txt-primary">
                  {edgarData["8k_analysis"]?.most_significant_item || '—'}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-txt-secondary text-xs">Combined severity</span>
                <span className="font-mono text-xs text-txt-secondary">
                  {Math.round((edgarData.combined_severity || 0) * 100)}%
                </span>
              </div>
              <div className="h-1 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="h-full rounded-full bg-accent-amber"
                  style={{ width: `${(edgarData.combined_severity || 0) * 100}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {(edgarData["8k_analysis"]?.filings || []).slice(0, 5).map((filing, idx) => {
                const items = filing.items || []
                const hasHighBearish = items.some(item => ['4.02', '3.01'].includes(item))
                const hasModerate = items.some(item => ['2.06', '2.05', '5.02', '1.02', '4.01'].includes(item))
                const hasBullish = items.some(item => ['1.01', '2.01'].includes(item))
                const itemColor = hasHighBearish
                  ? 'text-accent-red'
                  : hasModerate
                    ? 'text-accent-amber'
                    : hasBullish
                      ? 'text-accent-green'
                      : 'text-txt-secondary'
                return (
                  <div key={`${filing.url}-${idx}`} className="bg-surface-tertiary rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] text-txt-secondary">{filing.filing_date}</span>
                      <span className={`font-mono text-[11px] ${itemColor}`}>
                        {items.length ? items.join(', ') : 'No items'}
                      </span>
                    </div>
                    <div className="text-xs text-txt-primary truncate">
                      {filing.description}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {optionsFlow?.unusual_activity && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono font-bold text-sm text-txt-primary">Options Flow</h3>
              <span className={`pill ${
                optionsFlow.direction === 'bullish'
                  ? 'bg-accent-green-muted text-accent-green'
                  : optionsFlow.direction === 'bearish'
                    ? 'bg-accent-red-muted text-accent-red'
                    : 'bg-surface-tertiary text-txt-secondary'
              }`}>
                {(optionsFlow.direction || 'neutral').toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs">
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Unusual contracts</div>
                <div className="font-mono text-txt-primary text-base">{optionsFlow.unusual_contract_count ?? 0}</div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Put/Call ratio</div>
                <div className="font-mono text-txt-primary text-base">{(optionsFlow.put_call_ratio ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Dominant strike</div>
                <div className="font-mono text-txt-primary text-base">
                  {optionsFlow.dominant_strike != null ? `$${optionsFlow.dominant_strike.toFixed(2)}` : '—'}
                </div>
              </div>
              <div className="bg-surface-tertiary rounded p-2">
                <div className="text-txt-tertiary">Dominant expiry</div>
                <div className="font-mono text-txt-primary text-base">{optionsFlow.dominant_expiry || '—'}</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-txt-secondary text-xs">Max conviction</span>
                <span className="font-mono text-xs text-txt-secondary">
                  {Math.round((optionsFlow.max_conviction ?? 0) * 100)}%
                </span>
              </div>
              <div className="h-1 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                  className="h-full rounded-full bg-accent-blue"
                  style={{ width: `${(optionsFlow.max_conviction ?? 0) * 100}%` }}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-txt-tertiary border-b border-border">
                    <th className="text-left py-2 pr-2">Type</th>
                    <th className="text-left py-2 pr-2">Strike</th>
                    <th className="text-left py-2 pr-2">Expiry</th>
                    <th className="text-left py-2 pr-2">Volume</th>
                    <th className="text-left py-2 pr-2">OI</th>
                    <th className="text-left py-2 pr-2">Vol/OI</th>
                    <th className="text-left py-2">Conviction</th>
                  </tr>
                </thead>
                <tbody>
                  {(optionsFlow.top_contracts || []).slice(0, 5).map((c) => (
                    <tr key={c.contract_symbol} className="border-b border-border/40">
                      <td className={`py-2 pr-2 font-mono ${c.type === 'call' ? 'text-accent-green' : 'text-accent-red'}`}>
                        {c.type.toUpperCase()}
                      </td>
                      <td className="py-2 pr-2 font-mono text-txt-primary">${c.strike.toFixed(2)}</td>
                      <td className="py-2 pr-2 font-mono text-txt-secondary">{c.expiry}</td>
                      <td className="py-2 pr-2 font-mono text-txt-primary">{c.volume.toLocaleString()}</td>
                      <td className="py-2 pr-2 font-mono text-txt-secondary">{c.open_interest.toLocaleString()}</td>
                      <td className="py-2 pr-2 font-mono text-txt-secondary">{c.volume_oi_ratio.toFixed(2)}x</td>
                      <td className="py-2 font-mono text-accent-blue">{Math.round(c.conviction_score * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {chartData && <SignalHistory signals={chartData.signals} />}
      </div>
    )
  }

  // ── Grid view ────────────────────────────────────────────────
  return (
    <div>
      <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight mb-8">
        {'\u2B21'} Tickers
      </h2>

      {tickers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C7'}</div>
          <p className="text-txt-secondary text-sm mb-1">No tickers tracked yet.</p>
          <p className="text-txt-tertiary text-xs">Run a scan to start tracking tickers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {tickers.map(t => (
            <TickerCard key={t.ticker} ticker={t} onClick={() => setSelected(t.ticker)} />
          ))}
        </div>
      )}
    </div>
  )
}
