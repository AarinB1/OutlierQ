import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { HealthStatus, AutopilotStatus } from '../types'
import type { Section, Page, OptionsPage, TradingPage } from '../App'
import { fetchStatus } from '../api'
import ScanButton from './ScanButton'
import { useTradingSettings } from '../context/TradingSettingsContext'
import { BUILD_TIME, DEMO_MODE, NOTICE_DISMISS_KEY, REPO_URL } from '../demo/demoConfig'

interface Props {
  section: Section
  setSection: (s: Section) => void
  page: Page
  setPage: (p: Page) => void
  connected: boolean
  health: HealthStatus | null
  children: ReactNode
}

const OPTIONS_NAV: { key: OptionsPage; icon: string; label: string }[] = [
  { key: 'signals', icon: '\u26A1', label: 'Signals' },
  { key: 'events', icon: '\u25C9', label: 'Events' },
  { key: 'accuracy', icon: '\u25CE', label: 'Accuracy' },
  { key: 'tickers', icon: '\u2B21', label: 'Tickers' },
  { key: 'discovery', icon: '\u25C8', label: 'Discovery' },
  { key: 'predictions', icon: '\u25B2', label: 'Predictions' },
]

const TRADING_NAV: { key: TradingPage; icon: string; label: string }[] = [
  { key: 'trade-signals', icon: '\u2191\u2193', label: 'Signals' },
  { key: 'backtest', icon: '\u25B6', label: 'Backtest Lab' },
  { key: 'models', icon: '\u2699', label: 'Models' },
  { key: 'portfolio', icon: '\u25A3', label: 'Portfolio' },
  { key: 'performance', icon: '\u25CE', label: 'Performance' },
  { key: 'risk', icon: '\u26A0', label: 'Risk' },
  { key: 'strategies', icon: '\u2630', label: 'Strategies' },
  { key: 'charts', icon: '\u223F', label: 'Charts' },
  { key: 'watchlists', icon: '\u2606', label: 'Watchlists' },
  { key: 'journal', icon: '\u270E\uFE0E', label: 'Journal' },
  { key: 'dsl-editor', icon: '</>', label: 'DSL Editor' },
  { key: 'portfolio-backtest', icon: '\u25A6', label: 'Portfolio BT' },
  { key: 'trade-replay', icon: '\u21BB', label: 'Replay' },
  { key: 'greeks', icon: '\u0394', label: 'Greeks' },
]

const TRADING_FOOTER_NAV: { key: TradingPage; icon: string; label: string }[] = [
  { key: 'settings', icon: '\u2699', label: 'Settings' },
]

/**
 * Static-demo navigation: one flat list of the six pages the fixtures fully
 * back. Everything else is hidden rather than shipped as a broken shell, and
 * the Options/Trading switcher is hidden with it — with Backtest promoted into
 * this single list there is no second section left for it to point at.
 */
const DEMO_NAV: { key: Page; icon: string; label: string }[] = [
  { key: 'signals', icon: '\u26a1', label: 'Signals' },
  { key: 'events', icon: '\u25c9', label: 'Events' },
  { key: 'accuracy', icon: '\u25ce', label: 'Accuracy' },
  { key: 'tickers', icon: '\u2b21', label: 'Tickers' },
  { key: 'predictions', icon: '\u25b2', label: 'Predictions' },
  { key: 'backtest', icon: '\u25b6', label: 'Backtest Lab' },
]

function DemoBadge() {
  return (
    <span
      className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] leading-none
                 text-accent-amber border border-accent-amber/40 bg-accent-amber/10 rounded px-2 py-1"
      title="Static demo running on baked synthetic fixtures — no live market data"
    >
      Demo data
    </span>
  )
}

/** Session-scoped (not localStorage) so every new session sees it once. */
function DemoNotice() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(NOTICE_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null
  const dismiss = () => {
    try {
      sessionStorage.setItem(NOTICE_DISMISS_KEY, '1')
    } catch {
      // Private mode / storage disabled — the notice simply reappears.
    }
    setDismissed(true)
  }
  return (
    <div className="card border border-accent-amber/30 bg-accent-amber/10 mb-6 p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-amber">
            Static demo — synthetic data
          </p>
          <p className="text-sm text-txt-primary">
            This page is a static build with no backend. Every signal, event, price series
            and backtest below is <strong className="text-txt-primary">generated synthetic
            data</strong> baked in at build time — nothing here is a real trade, a real
            market quote, or a real prediction about any company. Tickers prefixed
            NRVX / ALTQ / TQNX are invented companies.
          </p>
          <p className="text-sm text-txt-primary">
            The actual pipeline runs locally: FastAPI + SQLite, news from Finnhub, prices
            from yfinance, FinBERT sentiment, and an isotonic confidence calibrator that
            stays inert until it has enough evaluated outcomes.
          </p>
          <p className="text-xs font-mono text-txt-primary">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-accent-amber underline hover:no-underline">
              github.com/AarinB1/OutlierQ
            </a>
            <span className="mx-2">·</span>
            fixtures built {BUILD_TIME.slice(0, 10)}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-txt-primary hover:text-accent-amber text-xs font-mono border border-border rounded px-2 py-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

const ET_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const ET_WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })

/* Regular-session approximation (ignores exchange holidays) */
function isMarketOpen(now: Date): boolean {
  const day = ET_WEEKDAY.format(now)
  if (day === 'Sat' || day === 'Sun') return false
  const [h, m] = ET_TIME.format(now).split(':').map(Number)
  const mins = h * 60 + m
  return mins >= 570 && mins < 960 // 09:30–16:00 ET
}

function MarketClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const open = isMarketOpen(now)
  return (
    <>
      <span
        className="flex items-center gap-1.5"
        title={DEMO_MODE
          ? 'Real exchange clock (your browser time). No market data is flowing in this demo.'
          : 'Regular-session approximation; exchange holidays are not applied.'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-accent-green' : 'bg-txt-tertiary'}`} />
        <span className={open ? 'text-accent-green' : 'text-txt-tertiary'}>{open ? 'NYSE OPEN' : 'NYSE CLOSED'}</span>
      </span>
      <span className="tabular-nums tracking-wider text-txt-secondary">{ET_TIME.format(now)} ET</span>
    </>
  )
}

function Topbar({ section, page, connected }: { section: Section; page: Page; connected: boolean }) {
  const navItems: { key: Page; label: string }[] = DEMO_MODE
    ? DEMO_NAV
    : section === 'options' ? OPTIONS_NAV : [...TRADING_NAV, ...TRADING_FOOTER_NAV]
  const idx = navItems.findIndex(n => n.key === page)
  const label = idx >= 0 ? navItems[idx].label : page
  return (
    <header className="sticky top-0 z-40 h-11 shrink-0 flex items-center gap-3 px-8 max-md:px-4 border-b border-border bg-surface-primary/60 backdrop-blur-md">
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-txt-tertiary">
        {DEMO_MODE ? 'demo' : section} <span className="mx-1 text-txt-tertiary">/</span>
        <span className="text-txt-primary">{label}</span>
      </span>
      {idx >= 0 && idx < TRADING_NAV.length && (
        <span className="font-mono text-[10px] leading-none text-accent-blue border border-accent-blue/30 rounded px-1.5 py-1">
          {String(idx + 1).padStart(2, '0')}
        </span>
      )}
      {/* Persistent, non-dismissible, visible at every breakpoint. */}
      {DEMO_MODE && (
        <span className="ml-auto">
          <DemoBadge />
        </span>
      )}
      <div className={`${DEMO_MODE ? 'ml-4' : 'ml-auto'} flex items-center gap-4 font-mono text-[11px] max-md:hidden`}>
        <MarketClock />
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
          <span className="text-txt-secondary">
            {DEMO_MODE ? 'DEMO FEED' : connected ? 'FEED LIVE' : 'FEED DOWN'}
          </span>
        </span>
        <span className="text-txt-tertiary max-lg:hidden" title="Keyboard shortcuts">[?] KEYS</span>
      </div>
    </header>
  )
}

function LayoutStatus() {
  const [status, setStatus] = useState<AutopilotStatus | null>(null)
  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
    const t = setInterval(() => {
      fetchStatus().then(setStatus).catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [])
  if (!status) return null
  return (
    <div className="px-3 pb-3 max-md:hidden border-t border-border pt-3 mt-auto">
      <div className="space-y-1.5 text-txt-tertiary text-xs font-mono">
        <p>{status.tickers_monitored} tickers · {status.signals_today} signals today</p>
        {status.is_autopilot_running && (
          <p className="flex items-center gap-1.5 text-accent-green">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
            </span>
            AUTOPILOT ACTIVE
          </p>
        )}
      </div>
    </div>
  )
}

export default function Layout({ section, setSection, page, setPage, connected, health, children }: Props) {
  void health
  const { demoMode, demoLoading, setDemoMode } = useTradingSettings()
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-surface-primary border-r border-border flex flex-col z-50
                         max-lg:w-12 max-md:w-full max-md:h-14 max-md:flex-row max-md:border-b max-md:border-r-0">
        {/* Logo */}
        <div className="px-6 py-4 max-lg:px-3 max-md:py-3 max-md:px-4 flex items-center gap-3 shrink-0">
          <div className="relative">
            <span className={`absolute -right-1 -top-1 w-2 h-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
            <span className={`absolute -right-1 -top-1 w-2 h-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'} ${connected ? 'animate-ping' : ''}`} style={{ animationDuration: '2s' }} />
          </div>
          <div className="max-lg:hidden">
            <h1 className="font-mono font-bold text-xl tracking-tight leading-none">
              <span className="text-accent-blue">Outlier</span><span className="text-txt-primary">Q</span>
            </h1>
            <p className="font-mono text-[8px] uppercase tracking-[0.35em] text-txt-tertiary mt-1 max-md:hidden">
              Event Terminal
            </p>
          </div>
          <span className="font-mono font-bold text-xl text-accent-blue lg:hidden max-md:hidden">Q</span>
        </div>

        {/* Section Switcher — not rendered in the demo: the curated set is one flat list */}
        {!DEMO_MODE && (
        <div className="px-3 pb-2 max-md:hidden">
          <div className="flex rounded-lg bg-surface-tertiary p-0.5">
            <button
              onClick={() => setSection('options')}
              className={`flex-1 text-center py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-150 ${
                section === 'options'
                  ? 'bg-surface-primary text-txt-primary shadow-sm'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              Options
            </button>
            <button
              onClick={() => setSection('trading')}
              className={`flex-1 text-center py-1.5 rounded-md text-xs font-sans font-medium transition-all duration-150 ${
                section === 'trading'
                  ? 'bg-surface-primary text-txt-primary shadow-sm'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              Trading
            </button>
          </div>
        </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 max-md:flex max-md:items-center max-md:space-y-0 max-md:gap-1 max-md:px-2 max-md:py-0 overflow-y-auto">
          <div className={`${DEMO_MODE ? 'hidden' : 'hidden max-md:flex'} items-center gap-1 pr-1 shrink-0`}>
            <button
              onClick={() => setSection('options')}
              className={`px-2 py-1 rounded text-[10px] font-sans font-semibold transition-all duration-150 ${
                section === 'options'
                  ? 'bg-surface-primary text-txt-primary border border-border'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              OPT
            </button>
            <button
              onClick={() => setSection('trading')}
              className={`px-2 py-1 rounded text-[10px] font-sans font-semibold transition-all duration-150 ${
                section === 'trading'
                  ? 'bg-surface-primary text-txt-primary border border-border'
                  : 'text-txt-tertiary hover:text-txt-secondary'
              }`}
            >
              TRD
            </button>
          </div>
          {(DEMO_MODE ? DEMO_NAV : section === 'options' ? OPTIONS_NAV : TRADING_NAV).map((n, i) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`group w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-sans font-medium uppercase tracking-[0.08em] transition-all duration-150
                max-lg:justify-center max-lg:px-0 max-md:px-3
                ${page === n.key
                  ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-blue max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                }`}
            >
              <span className="text-sm w-5 text-center normal-case">{n.icon}</span>
              <span className="max-lg:hidden">{n.label}</span>
              <span className={`ml-auto font-mono text-[10px] tracking-widest transition-colors max-lg:hidden max-md:hidden ${
                page === n.key ? 'text-accent-blue' : 'text-txt-tertiary group-hover:text-txt-tertiary'
              }`}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </button>
          ))}
          {!DEMO_MODE && section === 'trading' && (
            <div className="pt-2 mt-2 border-t border-border/50 space-y-0.5">
              {TRADING_FOOTER_NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setPage(n.key)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-sans font-medium uppercase tracking-[0.08em] transition-all duration-150
                    max-lg:justify-center max-lg:px-0 max-md:px-3
                    ${page === n.key
                      ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-blue max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                      : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                    }`}
                >
                  <span className="text-sm w-5 text-center normal-case">{n.icon}</span>
                  <span className="max-lg:hidden">{n.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Demo sidebar: keeps the /scan action reachable without the Trading section */}
        {DEMO_MODE && (
          <div className="px-3 pb-3 max-md:hidden space-y-3">
            <div className="card border border-accent-amber/20 bg-accent-amber/10 p-3">
              <p className="text-xs text-accent-amber font-medium uppercase tracking-wider mb-1">
                Synthetic fixtures
              </p>
              <p className="text-xs text-txt-secondary">
                Research tool — not financial advice. Scanning runs against the baked
                dataset, not a live market feed.
              </p>
            </div>
            <ScanButton />
          </div>
        )}

        {!DEMO_MODE && section === 'trading' && (
          <div className="px-3 pb-3 max-md:hidden space-y-3">
            <div className="card border border-accent-amber/20 bg-accent-amber/10 p-3">
              <p className="text-xs text-accent-amber font-medium uppercase tracking-wider mb-1">Paper Trading Only</p>
              <p className="text-xs text-txt-secondary">
                Research tool — not financial advice. No live execution.
              </p>
              <label className="mt-2 flex items-center justify-between gap-3 text-xs text-txt-secondary">
                <span>Demo Mode</span>
                <input
                  type="checkbox"
                  checked={demoMode}
                  disabled={demoLoading}
                  onChange={(e) => void setDemoMode(e.target.checked)}
                />
              </label>
            </div>
            <ScanButton />
          </div>
        )}

        {/* Status / Autopilot */}
        {connected && <LayoutStatus />}

        {/* Footer */}
        <div className="px-4 pb-4 flex items-center gap-2 text-txt-tertiary text-xs font-mono max-lg:px-2 max-lg:justify-center max-md:hidden">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500 ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
          <span className="max-lg:hidden">{DEMO_MODE ? 'Demo' : connected ? 'Live' : 'Offline'}</span>
          <span className="max-lg:hidden ml-auto">v1.5</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-scroll-area main-canvas flex-1 ml-60 max-lg:ml-12 max-md:ml-0 max-md:mt-14 overflow-y-auto">
        <Topbar section={section} page={page} connected={connected} />
        <div className="max-w-content mx-auto p-8 max-md:p-4">
          {DEMO_MODE && <DemoNotice />}
          {!DEMO_MODE && !connected ? (
            <div className="flex items-center justify-center h-[calc(100vh-11rem)]">
              {/* Corner-bracketed terminal frame */}
              <div className="relative bg-surface-secondary/70 border border-border px-12 py-10 max-md:px-6 text-center max-w-md">
                <span className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-accent-blue/70" aria-hidden />
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-txt-tertiary mb-5">Sys / Offline</p>
                <div className="text-txt-tertiary text-5xl mb-6">{'\u25C7'}</div>
                <h2 className="text-lg font-sans font-semibold text-txt-primary mb-2">API Disconnected</h2>
                <p className="text-txt-secondary text-sm">
                  Start the API server to connect the dashboard.
                </p>
                <code className="inline-block mt-4 px-4 py-2 rounded-lg bg-surface-primary border border-border text-accent-blue font-mono text-sm">
                  python scripts/run_ingestion.py --api
                </code>
                <p className="font-mono text-xs text-accent-green mt-6 animate-pulse">
                  {'\u258D'} awaiting connection
                </p>
              </div>
            </div>
          ) : (
            <>
              {children}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
