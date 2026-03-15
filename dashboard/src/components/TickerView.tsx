import { useState, useEffect } from 'react'
import { fetchTickers, fetchChartData, fetchCompanyInfo, fetchKeyStats } from '../api'
import type { TickerSummary, ChartData, CompanyInfo, KeyStats } from '../types'
import StockHeader from './StockHeader'
import PriceChart from './PriceChart'
import StatsGrid from './StatsGrid'
import SignalHistory from './SignalHistory'

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
      return
    }
    setDetailLoading(true)
    setError(null)
    Promise.all([
      fetchCompanyInfo(selected),
      fetchKeyStats(selected),
      fetchChartData(selected, period),
    ])
      .then(([i, s, c]) => { setInfo(i); setStats(s); setChartData(c) })
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
            <button
              key={t.ticker}
              onClick={() => setSelected(t.ticker)}
              className="text-left card transition-all duration-150 hover:border-border-hover"
            >
              <div className="font-mono font-bold text-xl text-txt-primary mb-3">{t.ticker}</div>
              <div className="space-y-1.5 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Signals</span>
                  <span className="font-mono text-txt-primary">{t.total_signals}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Win rate</span>
                  <span className={`font-mono ${t.win_rate >= 0.5 ? 'text-accent-green' : t.win_rate > 0 ? 'text-accent-red' : 'text-txt-secondary'}`}>
                    {(t.win_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-txt-tertiary">Last signal</span>
                  <span className="font-mono text-txt-tertiary text-[11px]">
                    {t.last_signal_date ? new Date(t.last_signal_date).toLocaleDateString() : '\u2014'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
