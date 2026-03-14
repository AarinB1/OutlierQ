import type { ReactNode } from 'react'
import type { HealthStatus } from '../types'
import type { Page } from '../App'
import ScanButton from './ScanButton'

interface Props {
  page: Page
  setPage: (p: Page) => void
  connected: boolean
  health: HealthStatus | null
  children: ReactNode
}

const NAV: { key: Page; icon: string; label: string }[] = [
  { key: 'signals', icon: '\u26A1', label: 'Signals' },
  { key: 'events', icon: '\u25C9', label: 'Events' },
  { key: 'accuracy', icon: '\u25CE', label: 'Accuracy' },
  { key: 'tickers', icon: '\u2B21', label: 'Tickers' },
]

export default function Layout({ page, setPage, connected, health, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-surface-primary border-r border-border flex flex-col z-50
                         max-lg:w-12 max-md:w-full max-md:h-14 max-md:flex-row max-md:border-b max-md:border-r-0">
        {/* Logo */}
        <div className="px-6 py-6 max-lg:px-3 max-md:py-3 max-md:px-4 flex items-center gap-3 shrink-0">
          <div className="relative">
            <span className={`absolute -right-1 -top-1 w-2 h-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
            <span className={`absolute -right-1 -top-1 w-2 h-2 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'} ${connected ? 'animate-ping' : ''}`} style={{ animationDuration: '2s' }} />
          </div>
          <h1 className="font-mono font-bold text-xl tracking-tight max-lg:hidden">
            <span className="text-accent-blue">Outlier</span><span className="text-txt-primary">Q</span>
          </h1>
          <span className="font-mono font-bold text-xl text-accent-blue lg:hidden max-md:hidden">Q</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-1 max-md:flex max-md:items-center max-md:space-y-0 max-md:gap-1 max-md:px-2 max-md:py-0 overflow-y-auto">
          {NAV.map(n => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-medium transition-all duration-150
                max-lg:justify-center max-lg:px-0 max-md:px-3
                ${page === n.key
                  ? 'bg-surface-tertiary text-txt-primary border-l-2 border-accent-blue max-lg:border-l-0 max-md:border-l-0 max-md:border-b-2'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary/50 border-l-2 border-transparent max-lg:border-l-0 max-md:border-l-0'
                }`}
            >
              <span className="text-base">{n.icon}</span>
              <span className="max-lg:hidden">{n.label}</span>
            </button>
          ))}
        </nav>

        {/* Scan */}
        <div className="px-3 pb-3 max-md:hidden">
          <ScanButton />
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 flex items-center gap-2 text-txt-tertiary text-xs font-mono max-lg:px-2 max-lg:justify-center max-md:hidden">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500 ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
          <span className="max-lg:hidden">{connected ? 'Live' : 'Offline'}</span>
          <span className="max-lg:hidden ml-auto">v1.0</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 max-lg:ml-12 max-md:ml-0 max-md:mt-14 overflow-y-auto bg-surface-tertiary">
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
            children
          )}
        </div>
      </main>
    </div>
  )
}
