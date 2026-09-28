import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { HealthStatus, AutopilotStatus } from '../types'
import type { Section, Page, OptionsPage, TradingPage } from '../App'
import { fetchStatus } from '../api'
import ScanButton from './ScanButton'
import Icon, { type IconName } from './Icon'
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

const OPTIONS_NAV: { key: OptionsPage; icon: IconName; label: string }[] = [
  { key: 'signals', icon: 'zap', label: 'Signals' },
  { key: 'events', icon: 'activity', label: 'Events' },
  { key: 'accuracy', icon: 'target', label: 'Accuracy' },
  { key: 'tickers', icon: 'grid', label: 'Tickers' },
  { key: 'discovery', icon: 'radar', label: 'Discovery' },
  { key: 'predictions', icon: 'scale', label: 'Predictions' },
]

const TRADING_NAV: { key: TradingPage; icon: IconName; label: string }[] = [
  { key: 'trade-signals', icon: 'arrows', label: 'Signals' },
  { key: 'backtest', icon: 'play', label: 'Backtest Lab' },
  { key: 'models', icon: 'cpu', label: 'Models' },
  { key: 'portfolio', icon: 'layers', label: 'Portfolio' },
  { key: 'performance', icon: 'pie', label: 'Performance' },
  { key: 'risk', icon: 'shield', label: 'Risk' },
  { key: 'strategies', icon: 'list', label: 'Strategies' },
  { key: 'charts', icon: 'trending-up', label: 'Charts' },
  { key: 'watchlists', icon: 'star', label: 'Watchlists' },
  { key: 'journal', icon: 'pencil', label: 'Journal' },
  { key: 'dsl-editor', icon: 'code', label: 'DSL Editor' },
  { key: 'portfolio-backtest', icon: 'grid', label: 'Portfolio BT' },
  { key: 'trade-replay', icon: 'rotate', label: 'Replay' },
  { key: 'greeks', icon: 'sigma', label: 'Greeks' },
]

const TRADING_FOOTER_NAV: { key: TradingPage; icon: IconName; label: string }[] = [
  { key: 'settings', icon: 'gear', label: 'Settings' },
]

/**
 * Static-demo navigation: one flat list of the six pages the fixtures fully
 * back. Everything else is hidden rather than shipped as a broken shell, and
 * the Options/Trading switcher is hidden with it — with Backtest promoted into
 * this single list there is no second section left for it to point at.
 */
const DEMO_NAV: { key: Page; icon: IconName; label: string }[] = [
  { key: 'signals', icon: 'zap', label: 'Signals' },
  { key: 'events', icon: 'activity', label: 'Events' },
  { key: 'accuracy', icon: 'target', label: 'Accuracy' },
  { key: 'tickers', icon: 'grid', label: 'Tickers' },
  { key: 'predictions', icon: 'scale', label: 'Predictions' },
  { key: 'backtest', icon: 'play', label: 'Backtest Lab' },
]

/** First-visit guidance: three things the fixtures fully support. */
const DEMO_TRY: { page: Page; label: string }[] = [
  { page: 'accuracy', label: 'Grade pending signals' },
  { page: 'tickers', label: "Open a ticker's history" },
  { page: 'backtest', label: 'Inspect a finished backtest' },
]

/** Landing page, one level up from /demo/. */
const LANDING_URL = `${import.meta.env.BASE_URL}../`

function DemoBadge() {
  return (
    <span
      className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] leading-none
                 text-accent-amber border border-accent-amber/40 bg-accent-amber/10 rounded px-2 py-1"
      title="Static demo running on baked synthetic fixtures — no live market data"
    >
      Demo data
    </span>
  )
}

/** One disclosure line, one expandable paragraph, and three guided starting
 *  points. Session-scoped (not localStorage) so every new session sees it once;
 *  the DEMO DATA badge in the top bar stays visible regardless. */
function DemoNotice({ onNavigate }: { onNavigate: (p: Page) => void }) {
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
      // Private mode / storage disabled: the notice simply reappears.
    }
    setDismissed(true)
  }
  return (
    <section aria-label="About this demo" className="mb-8 rounded-card border border-accent-amber/35 bg-surface-secondary">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <Icon name="info" className="mt-0.5 h-4 w-4 text-accent-amber" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-txt-primary">
          <p>
            <strong className="font-semibold">Static demo on synthetic data.</strong>{' '}
            <span className="text-txt-secondary">
              Nothing here is a real trade, quote, or prediction. NRVX, ALTQ and TQNX are invented
              companies.
            </span>
          </p>
          <details className="group mt-1.5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-accent-amber hover:underline [&::-webkit-details-marker]:hidden">
              How the real pipeline runs
              <Icon name="chevron-down" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-txt-secondary">
              Locally, with FastAPI and SQLite, news from Finnhub, prices from yfinance, FinBERT
              sentiment, and an isotonic confidence calibrator that stays inert until it has enough
              graded outcomes. Here there is no backend: every record is generated in your browser
              and dated relative to today.{' '}
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-accent-amber underline hover:no-underline">
                Source on GitHub
              </a>
              <span className="mx-1.5">·</span>
              <span className="font-mono">build {BUILD_TIME.slice(0, 10)}</span>
            </p>
          </details>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss demo notice"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-txt-secondary transition-colors hover:bg-surface-tertiary hover:text-txt-primary"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1 border-t border-border px-4 py-2.5 sm:px-5 lg:flex-row lg:items-center lg:gap-3">
        <span className="label shrink-0 whitespace-nowrap text-txt-tertiary lg:w-44">Three things to try</span>
        {DEMO_TRY.map((t, i) => (
          <button
            key={t.page}
            type="button"
            onClick={() => onNavigate(t.page)}
            className="flex min-h-[40px] flex-1 items-center gap-3 rounded px-1 text-left text-sm text-txt-primary transition-colors hover:bg-surface-tertiary lg:px-3"
          >
            <span className="font-mono text-[11px] text-txt-tertiary">{String(i + 1).padStart(2, '0')}</span>
            {t.label}
            <Icon name="arrow-up-right" className="ml-auto h-3.5 w-3.5 text-txt-tertiary" />
          </button>
        ))}
        <a
          href={`${LANDING_URL}#lab`}
          className="flex min-h-[40px] items-center gap-2 px-1 text-sm text-accent-blue hover:underline lg:px-3"
        >
          Try the signal lab
          <Icon name="arrow-right" className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
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
        {/* Wordmark: same mark as the landing page, in the dark variant. */}
        <div className="px-6 py-5 max-lg:px-3 max-md:py-3 max-md:px-4 flex items-center shrink-0 max-lg:justify-center">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em] text-txt-primary leading-none">
            <Icon name="spike" className="h-5 w-5 text-accent-blue" strokeWidth={2.4} />
            {/* Mark only below lg: on phones the six nav icons need the width. */}
            <span className="max-lg:hidden">
              OutlierQ<span className="text-accent-blue">.</span>
            </span>
          </h1>
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
              aria-current={page === n.key ? 'page' : undefined}
              className={`group w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-sans font-medium transition-all duration-150
                max-lg:justify-center max-lg:px-0 max-md:px-3 max-md:py-2.5
                ${page === n.key
                  ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-ice max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                }`}
            >
              <Icon name={n.icon} className={`h-4 w-4 ${page === n.key ? 'text-accent-ice' : ''}`} />
              {/* sr-only, not hidden, when collapsed to icons: the label stays
                  the button's accessible name at every width. */}
              <span className="max-lg:sr-only">{n.label}</span>
              <span aria-hidden="true" className={`ml-auto font-mono text-[11px] tracking-widest transition-colors max-lg:hidden max-md:hidden ${
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
                  className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-sans font-medium transition-all duration-150
                    max-lg:justify-center max-lg:px-0 max-md:px-3
                    ${page === n.key
                      ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-ice max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                      : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                    }`}
                >
                  <Icon name={n.icon} className="h-4 w-4" />
                  <span className="max-lg:sr-only">{n.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Demo sidebar: keeps the /scan action reachable without the Trading
            section. The synthetic-data disclosure lives in the top bar badge and
            the page notice, not repeated here. */}
        {DEMO_MODE && (
          <div className="px-3 pb-3 max-md:hidden">
            <p className="label mb-2 px-1 text-txt-tertiary">Scan tickers</p>
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
          {DEMO_MODE && <DemoNotice onNavigate={setPage} />}
          {!DEMO_MODE && !connected ? (
            <div className="flex items-center justify-center h-[calc(100vh-11rem)]">
              {/* Corner-bracketed terminal frame */}
              <div className="relative bg-surface-secondary/70 border border-border px-12 py-10 max-md:px-6 text-center max-w-md">
                <span className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-accent-blue/70" aria-hidden />
                <span className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-accent-blue/70" aria-hidden />
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-txt-tertiary mb-5">Sys / Offline</p>
                <Icon name="spike" className="mx-auto mb-6 h-12 w-12 text-txt-tertiary" strokeWidth={1.4} />
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
