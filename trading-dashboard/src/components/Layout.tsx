import type { Page } from '../types'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'signals', label: 'Signals', icon: '⚡' },
  { id: 'backtest', label: 'Backtest Lab', icon: '🧪' },
  { id: 'models', label: 'Models', icon: '🧠' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' },
  { id: 'risk', label: 'Risk', icon: '🛡️' },
  { id: 'strategy', label: 'Strategy', icon: '⚙️' },
  { id: 'chart', label: 'Chart', icon: '📈' },
]

interface LayoutProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-surface-secondary border-r border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <h1 className="font-mono font-bold text-lg text-txt-primary tracking-tight">
            OutlierQ
          </h1>
          <p className="text-xs text-txt-tertiary font-mono mt-0.5">Trading AI</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans transition-colors ${
                currentPage === item.id
                  ? 'bg-accent-blue-muted text-accent-blue'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-tertiary'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <p className="text-[10px] text-txt-tertiary font-mono leading-relaxed">
            Paper trading only.
            <br />
            Not financial advice.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-content mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
