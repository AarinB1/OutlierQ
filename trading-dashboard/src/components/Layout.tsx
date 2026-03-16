import type { ReactNode } from 'react'
import type { Page } from '../App'

interface Props {
  page: Page
  setPage: (page: Page) => void
  children: ReactNode
}

const NAV: Array<{ key: Page; label: string }> = [
  { key: 'signals', label: 'Trading Signals' },
  { key: 'backtest', label: 'Backtest Lab' },
  { key: 'models', label: 'Model Performance' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'performance', label: 'Performance' },
  { key: 'risk', label: 'Risk Dashboard' },
  { key: 'strategy', label: 'Strategy Builder' },
  { key: 'charts', label: 'Chart View' },
  { key: 'watchlists', label: 'Watchlists' },
  { key: 'journal', label: 'Journal' },
  { key: 'settings', label: 'Settings' },
]

export default function Layout({ page, setPage, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-surface-primary border-r border-border p-4 overflow-y-auto">
        <h1 className="font-mono font-bold text-xl mb-4">
          <span className="text-accent-blue">Outlier</span>Q Trading
        </h1>
        <div className="mb-4 card border border-accent-amber/30 bg-accent-amber-muted">
          <p className="text-xs text-accent-amber font-medium uppercase tracking-wider mb-1">Paper Trading Only</p>
          <p className="text-xs text-txt-secondary">
            Research environment only. Not financial advice. No live brokerage execution.
          </p>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                page === n.key ? 'bg-surface-tertiary text-txt-primary' : 'text-txt-secondary hover:bg-surface-secondary'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 bg-surface-tertiary overflow-y-auto">
        <div className="max-w-content mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}

