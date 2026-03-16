import { useState, useEffect } from 'react'
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
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export default function DiscoveryPanel() {
  const [discoveries, setDiscoveries] = useState<DiscoveryRecord[]>([])
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [activeTickers, setActiveTickers] = useState<ActiveTickers | null>(null)
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [scanningTicker, setScanningTicker] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { visibleItems, getDelay, ready } = useStaggeredList(discoveries)

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([fetchDiscoveries({ limit: 50 }), fetchDiscoveryStats(), fetchActiveTickers()])
      .then(([list, s, active]) => {
        setDiscoveries(list)
        setStats(s)
        setActiveTickers(active)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleDiscover = () => {
    setDiscovering(true)
    setError(null)
    triggerDiscover()
      .then(() => load())
      .catch(e => setError(e.message))
      .finally(() => setDiscovering(false))
  }

  const handleScanTicker = (ticker: string) => {
    setScanningTicker(ticker)
    setError(null)
    triggerScan([ticker])
      .then(() => load())
      .catch(e => setError(e.message))
      .finally(() => setScanningTicker(null))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
          {'\u25C8'} Discovery
        </h2>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className={`btn-primary inline-flex items-center gap-2 ${discovering ? 'opacity-70 cursor-wait' : ''}`}
        >
          {discovering && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {discovering ? 'Discovering...' : 'Discover Now'}
        </button>
      </div>

      {activeTickers && (
        <div className="card mb-6">
          <p className="label text-txt-tertiary mb-2">Active tickers ({activeTickers.count} monitored)</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {activeTickers.by_source.manual.length > 0 && (
              <div>
                <span className="text-txt-tertiary font-sans">Manual / events:</span>
                <span className="font-mono text-txt-primary ml-1">{activeTickers.by_source.manual.length}</span>
              </div>
            )}
            {activeTickers.by_source.news_scanner.length > 0 && (
              <div>
                <span className="text-accent-blue font-sans">News:</span>
                <span className="font-mono text-txt-primary ml-1">{activeTickers.by_source.news_scanner.length}</span>
              </div>
            )}
            {activeTickers.by_source.volume_screener.length > 0 && (
              <div>
                <span className="text-accent-amber font-sans">Volume:</span>
                <span className="font-mono text-txt-primary ml-1">{activeTickers.by_source.volume_screener.length}</span>
              </div>
            )}
            {activeTickers.by_source.both.length > 0 && (
              <div>
                <span className="text-accent-green font-sans">Both:</span>
                <span className="font-mono text-txt-primary ml-1">{activeTickers.by_source.both.length}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card">
            <p className="label text-txt-tertiary mb-1">Discovered today</p>
            <p className="font-mono font-bold text-2xl text-txt-primary">{stats.discovered_today}</p>
          </div>
          <div className="card">
            <p className="label text-txt-tertiary mb-1">Led to signals today</p>
            <p className="font-mono font-bold text-2xl text-accent-green">{stats.led_to_signals_today}</p>
          </div>
          <div className="card">
            <p className="label text-txt-tertiary mb-1">Total discovered</p>
            <p className="font-mono font-bold text-2xl text-txt-primary">{stats.total_discovered}</p>
          </div>
          <div className="card">
            <p className="label text-txt-tertiary mb-1">Total led to signals</p>
            <p className="font-mono font-bold text-2xl text-accent-blue">{stats.total_led_to_signals}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="card border-accent-red/30 bg-accent-red-muted mb-6">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-48" />
          ))}
        </div>
      ) : discoveries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-txt-tertiary text-4xl mb-4">{'\u25C8'}</div>
          <p className="text-txt-secondary text-sm mb-1">No discoveries yet.</p>
          <p className="text-txt-tertiary text-xs">
            Run a discovery scan to find emerging opportunities.
          </p>
          <button onClick={handleDiscover} className="btn-primary mt-6" disabled={discovering}>
            Discover Now
          </button>
        </div>
      ) : (
        <div className={`stagger-container grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 ${ready ? 'is-ready' : ''}`}>
          {visibleItems.map((d, index) => (
            <div
              key={d.id}
              className="stagger-item card border-l-[3px] border-l-accent-blue"
              style={{ animationDelay: getDelay(index) }}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="font-mono font-bold text-2xl text-txt-primary tracking-tight">
                  {d.ticker}
                </span>
                <div className="flex items-center gap-1.5">
                  {methodBadges(d.discovery_method)}
                  {isToday(d.discovered_at) && (
                    <span className="pill bg-accent-green-muted text-accent-green animate-pulse">NEW</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-txt-secondary text-xs font-mono mb-3">
                {d.mention_count != null && <span>Mentions: {d.mention_count}</span>}
                {d.volume_ratio != null && <span>Vol: {d.volume_ratio}x</span>}
              </div>

              {/* Confidence bar */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-txt-secondary text-xs">Confidence</span>
                  <span className="font-mono text-xs text-txt-secondary">
                    {(d.discovery_confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-accent-blue"
                    style={{ width: `${d.discovery_confidence * 100}%` }}
                  />
                </div>
              </div>

              {d.sample_headlines && d.sample_headlines.length > 0 && (
                <div className="mb-3">
                  <p className="text-txt-tertiary text-[11px] uppercase tracking-wider mb-1">Headlines</p>
                  <ul className="space-y-1">
                    {d.sample_headlines.slice(0, 3).map((h, i) => (
                      <li key={i} className="text-txt-secondary text-xs truncate" title={h}>
                        {h.length > 60 ? `${h.slice(0, 60)}...` : h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                <span className="text-txt-tertiary text-[11px] font-sans">
                  Discovered {timeAgo(d.discovered_at)}
                </span>
                <button
                  onClick={() => handleScanTicker(d.ticker)}
                  disabled={scanningTicker === d.ticker}
                  className="text-xs font-mono font-bold text-accent-blue hover:underline disabled:opacity-50"
                >
                  {scanningTicker === d.ticker ? 'Scanning...' : 'Scan This Ticker'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
