import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { HealthStatus, AutopilotStatus } from '../types'
import type { Section, Page, OptionsPage, TradingPage } from '../App'
import { fetchStatus } from '../api'
import ScanButton from './ScanButton'
import { useTradingSettings } from '../context/TradingSettingsContext'

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
          <h1 className="font-mono font-bold text-xl tracking-tight max-lg:hidden">
            <span className="text-accent-blue">Outlier</span><span className="text-txt-primary">Q</span>
          </h1>
          <span className="font-mono font-bold text-xl text-accent-blue lg:hidden max-md:hidden">Q</span>
        </div>

        {/* Section Switcher */}
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 max-md:flex max-md:items-center max-md:space-y-0 max-md:gap-1 max-md:px-2 max-md:py-0 overflow-y-auto">
          <div className="hidden max-md:flex items-center gap-1 pr-1 shrink-0">
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
          {(section === 'options' ? OPTIONS_NAV : TRADING_NAV).map(n => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-all duration-150
                max-lg:justify-center max-lg:px-0 max-md:px-3
                ${page === n.key
                  ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-blue max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                }`}
            >
              <span className="text-sm w-5 text-center">{n.icon}</span>
              <span className="max-lg:hidden">{n.label}</span>
            </button>
          ))}
          {section === 'trading' && (
            <div className="pt-2 mt-2 border-t border-border/50 space-y-0.5">
              {TRADING_FOOTER_NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => setPage(n.key)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-all duration-150
                    max-lg:justify-center max-lg:px-0 max-md:px-3
                    ${page === n.key
                      ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-blue max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                      : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                    }`}
                >
                  <span className="text-sm w-5 text-center">{n.icon}</span>
                  <span className="max-lg:hidden">{n.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {section === 'trading' && (
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
          <span className="max-lg:hidden">{connected ? 'Live' : 'Offline'}</span>
          <span className="max-lg:hidden ml-auto">v1.5</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-scroll-area flex-1 ml-60 max-lg:ml-12 max-md:ml-0 max-md:mt-14 overflow-y-auto bg-surface-tertiary">
        <div className="max-w-content mx-auto p-8 max-md:p-4">
          {!connected ? (
            <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
              <div className="text-center">
                <div className="text-txt-tertiary text-5xl mb-6">{'\u25C7'}</div>
                <h2 className="text-lg font-sans font-semibold text-txt-primary mb-2">API Disconnected</h2>
                <p className="text-txt-secondary text-sm max-w-sm">
                  Start the API server to connect the dashboard.
                </p>
                <code className="inline-block mt-4 px-4 py-2 rounded-lg bg-surface-secondary border border-border text-accent-blue font-mono text-sm">
                  python scripts/run_ingestion.py --api
                </code>
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
