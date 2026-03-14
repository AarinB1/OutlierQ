import type { ReactNode } from 'react'
import type { HealthStatus } from '../types'
import ScanButton from './ScanButton'

type Page = 'signals' | 'events' | 'accuracy' | 'tickers'

interface Props {
  page: Page
  setPage: (p: Page) => void
  connected: boolean
  health: HealthStatus | null
  children: ReactNode
}

const NAV: { key: Page; label: string }[] = [
  { key: 'signals', label: 'Signals' },
  { key: 'events', label: 'Events' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'tickers', label: 'Tickers' },
]

export default function Layout({ page, setPage, connected, health, children }: Props) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-info">Outlier</span>Q
          </h1>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-bullish' : 'bg-bearish'}`} />
            {connected ? 'API connected' : 'API disconnected'}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(n => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${
                page === n.key
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {health && connected && (
          <div className="p-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
            <div>Signals: <span className="font-mono text-gray-300">{health.signals_count}</span></div>
            <div>Events: <span className="font-mono text-gray-300">{health.events_count}</span></div>
          </div>
        )}

        <div className="p-3 border-t border-gray-800">
          <ScanButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {!connected ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-4">&#x26A0;</div>
              <h2 className="text-lg font-semibold text-gray-300">API Disconnected</h2>
              <p className="mt-2 text-sm">Start the API server with: <code className="text-info font-mono">python scripts/run_ingestion.py --api</code></p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
