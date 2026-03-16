import { useEffect, useState } from 'react'
import { fetchDiscoveries, fetchDiscoveryStats, fetchActiveTickers, triggerDiscover, triggerScan } from '../api'
import type { DiscoveryRecord, DiscoveryStats, ActiveTickers } from '../types'
import { useStaggeredList } from '../hooks/useStaggeredList'

function methodBadges(method: string) {
  const m = method.toLowerCase()
  if (m === 'both') {
    return <span className="pill bg-accent-green-muted text-accent-green">BOTH</span>
  }
  if (m === 'news_scanner') {
    return <span className="pill bg-accent-blue/20 text-accent-blue">NEWS</span>
  }
  return <span className="pill bg-accent-amber-muted text-accent-amber">VOLUME</span>
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'Just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

export default function DiscoveryPanel() {
  const [discoveries, setDiscoveries] = useState<DiscoveryRecord[]>([])
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [activeTickers, setActiveTickers] = useState<ActiveTickers | null>(null)
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [scanningTicker, setScanningTicker] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([fetchDiscoveries({ limit: 50 }), fetchDiscoveryStats(), fetchActiveTickers()])
      .then(([list, statsData, active]) => {
        setDiscoveries(list)
        setStats(statsData)
        setActiveTickers(active)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const { visibleItems, getDelay } = useStaggeredList(discoveries, 50)

  const handleDiscover = () => {
    setDiscovering(true)
    setError(null)
    triggerDiscover()
      .then(() => load())
      .catch((e) => setError(e.message))
      .finally(() => setDiscovering(false))
  }

  const handleScanTicker = (ticker: string) => {
    setScanningTicker(ticker)
    setError(null)
    triggerScan([ticker])
      .then(() => load())
      .catch((e) => setError(e.message))
      .finally(() => setScanningTicker(null))
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">{'\u25C8'} Discovery</h2>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className={`btn-primary ${discovering ? 'cursor-wait opacity-70' : ''}`}
        >
          <span className="inline-flex items-center gap-2">
            {discovering ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-white" />
            ) : null}
            {discovering ? 'Discovering...' : 'Discover Now'}
          </span>
        </button>
      </div>

      {activeTickers && (
        <div className="card mb-6">
          <p className="label mb-2 text-txt-tertiary">Active tickers ({activeTickers.count} monitored)</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {activeTickers.by_source.manual.length > 0 && (
              <div>
                <span className="font-sans text-txt-tertiary">Manual / events:</span>
                <span className="ml-1 font-mono text-txt-primary">{activeTickers.by_source.manual.length}</span>
              </div>
            )}
            {activeTickers.by_source.news_scanner.length > 0 && (
              <div>
                <span className="font-sans text-accent-blue">News:</span>
                <span className="ml-1 font-mono text-txt-primary">{activeTickers.by_source.news_scanner.length}</span>
              </div>
            )}
            {activeTickers.by_source.volume_screener.length > 0 && (
              <div>
                <span className="font-sans text-accent-amber">Volume:</span>
                <span className="ml-1 font-mono text-txt-primary">{activeTickers.by_source.volume_screener.length}</span>
              </div>
            )}
            {activeTickers.by_source.both.length > 0 && (
              <div>
                <span className="font-sans text-accent-green">Both:</span>
                <span className="ml-1 font-mono text-txt-primary">{activeTickers.by_source.both.length}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card">
            <p className="label mb-1 text-txt-tertiary">Discovered today</p>
            <p className="font-mono text-2xl font-bold text-txt-primary">{stats.discovered_today}</p>
          </div>
          <div className="card">
            <p className="label mb-1 text-txt-tertiary">Led to signals today</p>
            <p className="font-mono text-2xl font-bold text-accent-green">{stats.led_to_signals_today}</p>
          </div>
          <div className="card">
            <p className="label mb-1 text-txt-tertiary">Total discovered</p>
            <p className="font-mono text-2xl font-bold text-txt-primary">{stats.total_discovered}</p>
          </div>
          <div className="card">
            <p className="label mb-1 text-txt-tertiary">Total led to signals</p>
            <p className="font-mono text-2xl font-bold text-accent-blue">{stats.total_led_to_signals}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="card mb-6 border-accent-red/30 bg-accent-red-muted">
          <p className="text-sm text-accent-red">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-48" />
          ))}
        </div>
      ) : discoveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-4 text-4xl text-txt-tertiary">{'\u25C8'}</div>
          <p className="mb-1 text-sm text-txt-secondary">No discoveries yet.</p>
          <p className="text-xs text-txt-tertiary">Run a discovery scan to find emerging opportunities.</p>
          <button onClick={handleDiscover} className="btn-primary mt-6" disabled={discovering}>
            Discover Now
          </button>
        </div>
      ) : (
        <div className="stagger-container grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((discovery, index) => (
            <div key={discovery.id} className="stagger-item" style={getDelay(index)}>
              <div className="card border-l-[3px] border-l-accent-blue">
                <div className="mb-3 flex items-start justify-between">
                  <span className="font-mono text-2xl font-bold tracking-tight text-txt-primary">
                    {discovery.ticker}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isToday(discovery.discovered_at) && (
                      <span className="pill animate-pulse bg-accent-green-muted text-accent-green">NEW</span>
                    )}
                    {methodBadges(discovery.discovery_method)}
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-txt-secondary">
                  {discovery.mention_count != null && <span>Mentions: {discovery.mention_count}</span>}
                  {discovery.volume_ratio != null && <span>Vol: {discovery.volume_ratio}x</span>}
                </div>

                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-txt-secondary">Confidence</span>
                    <span className="font-mono text-xs text-txt-secondary">
                      {(discovery.discovery_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-white/5">
                    <div
                      className="confidence-bar h-full rounded-full bg-accent-blue"
                      style={{ width: `${discovery.discovery_confidence * 100}%` }}
                    />
                  </div>
                </div>

                {discovery.sample_headlines.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-txt-tertiary">Headlines</p>
                    <ul className="space-y-1">
                      {discovery.sample_headlines.slice(0, 3).map((headline, headlineIndex) => (
                        <li key={headlineIndex} className="truncate text-xs text-txt-secondary" title={headline}>
                          {headline.length > 60 ? `${headline.slice(0, 60)}...` : headline}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[11px] text-txt-tertiary">Discovered {timeAgo(discovery.discovered_at)}</span>
                  <button
                    onClick={() => handleScanTicker(discovery.ticker)}
                    disabled={scanningTicker === discovery.ticker}
                    className="text-xs font-bold text-accent-blue transition-colors hover:text-txt-primary disabled:opacity-50"
                  >
                    {scanningTicker === discovery.ticker ? 'Scanning...' : 'Scan This Ticker'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
