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
  const [renderedPage, setRenderedPage] = useState<Page>('signals')
  const [isExiting, setIsExiting] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [focusTicker, setFocusTicker] = useState<string | null>(null)

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

  const navigateFromShortcut = useCallback((target: Page) => {
    setSection('options')
    setPage(target)
  }, [])

  useKeyboardShortcuts({
    enabled: true,
    onNavigate: navigateFromShortcut,
    onToggleShortcuts: () => setShortcutsOpen((prev) => !prev),
  })

  useEffect(() => {
    if (page === renderedPage) return
    setIsExiting(true)
    const timeout = window.setTimeout(() => {
      setRenderedPage(page)
      setIsExiting(false)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [page, renderedPage])

  return (
    <ToastProvider>
      <Layout
        section={section}
        setSection={handleSectionChange}
        page={page}
        setPage={setPage}
        connected={connected}
        health={health}
      >
        <div
          key={renderedPage}
          className={`transition-opacity duration-150 ${isExiting ? 'opacity-0' : 'opacity-100 animate-fade-in'}`}
        >
          {/* Options pages */}
          {renderedPage === 'signals' && <SignalList onTickerClick={navigateToTicker} />}
          {renderedPage === 'events' && <EventTimeline onTickerClick={navigateToTicker} />}
          {renderedPage === 'accuracy' && <AccuracyPanel />}
          {renderedPage === 'tickers' && (
            <TickerView
              initialTicker={focusTicker}
              onNavigated={() => setFocusTicker(null)}
            />
          )}
          {renderedPage === 'discovery' && <DiscoveryPanel />}

          {/* Trading pages */}
          {renderedPage === 'trade-signals' && <TradingSignals />}
          {renderedPage === 'backtest' && <BacktestPanel />}
          {renderedPage === 'models' && <ModelPerformance />}
          {renderedPage === 'portfolio' && <PortfolioView />}
          {renderedPage === 'risk' && <RiskDashboard />}
          {renderedPage === 'strategies' && <StrategyBuilder />}
          {renderedPage === 'charts' && <ChartView />}
        </div>
      </Layout>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </ToastProvider>
  )
}
