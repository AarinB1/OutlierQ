import { useState, useEffect, useCallback } from 'react'
import { fetchHealth } from './api'
import type { HealthStatus } from './types'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import ShortcutsModal from './components/ShortcutsModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
// Options pages (existing)
import SignalList from './components/SignalList'
import EventTimeline from './components/EventTimeline'
import AccuracyPanel from './components/AccuracyPanel'
import TickerView from './components/TickerView'
import DiscoveryPanel from './components/DiscoveryPanel'
// Trading pages (new)
import TradingSignals from './components/trading/TradingSignals'
import BacktestPanel from './components/trading/BacktestPanel'
import ModelPerformance from './components/trading/ModelPerformance'
import PortfolioView from './components/trading/PortfolioView'
import RiskDashboard from './components/trading/RiskDashboard'
import StrategyBuilder from './components/trading/StrategyBuilder'
import ChartView from './components/trading/ChartView'

export type Section = 'options' | 'trading'

export type OptionsPage = 'signals' | 'events' | 'accuracy' | 'tickers' | 'discovery'
export type TradingPage = 'trade-signals' | 'backtest' | 'models' | 'portfolio' | 'risk' | 'strategies' | 'charts'
export type Page = OptionsPage | TradingPage

export default function App() {
  const [section, setSection] = useState<Section>('options')
  const [page, setPage] = useState<Page>('signals')
  const [displayedPage, setDisplayedPage] = useState<Page>('signals')
  const [pagePhase, setPagePhase] = useState<'enter' | 'exit'>('enter')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [focusTicker, setFocusTicker] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // When section changes, switch to the first page of that section
  const handleSectionChange = useCallback((s: Section) => {
    setSection(s)
    setPage(s === 'options' ? 'signals' : 'trade-signals')
  }, [])

  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then(h => { setHealth(h); setConnected(true) })
        .catch(() => setConnected(false))
    }
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  const navigateToTicker = useCallback((ticker: string) => {
    setFocusTicker(ticker)
    setPage('tickers')
    setSection('options')
  }, [])

  const handlePageChange = useCallback((nextPage: Page) => {
    setPage(nextPage)
  }, [])

  useEffect(() => {
    if (page === displayedPage) {
      setPagePhase('enter')
      return
    }

    setPagePhase('exit')
    const timeoutId = window.setTimeout(() => {
      setDisplayedPage(page)
      setPagePhase('enter')
    }, 100)

    return () => window.clearTimeout(timeoutId)
  }, [displayedPage, page])

  useKeyboardShortcuts({
    onNavigate: (nextPage) => {
      setSection('options')
      setPage(nextPage)
    },
    onFocusSearch: () => {
      const searchInput = document.getElementById('global-ticker-search') as HTMLInputElement | null
      searchInput?.focus()
      searchInput?.select()
    },
    onToggleShortcuts: () => setShowShortcuts((current) => !current),
  })

  return (
    <ToastProvider>
      <Layout
        section={section}
        setSection={handleSectionChange}
        page={page}
        setPage={handlePageChange}
        connected={connected}
        health={health}
      >
        <div
          key={displayedPage}
          className={`transition-all duration-100 ${
            pagePhase === 'exit' ? 'translate-y-1 opacity-0' : 'animate-fade-in'
          }`}
        >
          {/* Options pages */}
          {displayedPage === 'signals' && <SignalList onTickerClick={navigateToTicker} />}
          {displayedPage === 'events' && <EventTimeline onTickerClick={navigateToTicker} />}
          {displayedPage === 'accuracy' && <AccuracyPanel />}
          {displayedPage === 'tickers' && (
            <TickerView
              initialTicker={focusTicker}
              onNavigated={() => setFocusTicker(null)}
            />
          )}
          {displayedPage === 'discovery' && <DiscoveryPanel />}

          {/* Trading pages */}
          {displayedPage === 'trade-signals' && <TradingSignals />}
          {displayedPage === 'backtest' && <BacktestPanel />}
          {displayedPage === 'models' && <ModelPerformance />}
          {displayedPage === 'portfolio' && <PortfolioView />}
          {displayedPage === 'risk' && <RiskDashboard />}
          {displayedPage === 'strategies' && <StrategyBuilder />}
          {displayedPage === 'charts' && <ChartView />}
        </div>
      </Layout>
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </ToastProvider>
  )
}
