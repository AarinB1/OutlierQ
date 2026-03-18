import { useState, useEffect, useCallback } from 'react'
import { fetchHealth } from './api'
import type { HealthStatus } from './types'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import ShortcutsModal from './components/ShortcutsModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { TradingSettingsProvider } from './context/TradingSettingsContext'
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
import WatchlistManager from './components/trading/WatchlistManager'
import TradeJournal from './components/trading/TradeJournal'
import PerformanceAttribution from './components/trading/PerformanceAttribution'
import SettingsPage from './components/trading/SettingsPage'
import StrategyEditor from './components/trading/StrategyEditor'
import PortfolioBacktest from './components/trading/PortfolioBacktest'
import TradeReplay from './components/trading/TradeReplay'
import GreeksCalculator from './components/trading/GreeksCalculator'

export type Section = 'options' | 'trading'

export type OptionsPage = 'signals' | 'events' | 'accuracy' | 'tickers' | 'discovery'
export type TradingPage =
  | 'trade-signals'
  | 'backtest'
  | 'models'
  | 'portfolio'
  | 'performance'
  | 'risk'
  | 'strategies'
  | 'charts'
  | 'watchlists'
  | 'journal'
  | 'settings'
  | 'dsl-editor'
  | 'portfolio-backtest'
  | 'trade-replay'
  | 'greeks'
export type Page = OptionsPage | TradingPage

export default function App() {
  const [section, setSection] = useState<Section>('options')
  const [page, setPage] = useState<Page>('signals')
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

  return (
    <ToastProvider>
      <TradingSettingsProvider>
        <Layout
          section={section}
          setSection={handleSectionChange}
          page={page}
          setPage={setPage}
          connected={connected}
          health={health}
        >
          <div key={page} className="animate-fade-in">
            {/* Options pages */}
            {page === 'signals' && <SignalList onTickerClick={navigateToTicker} />}
            {page === 'events' && <EventTimeline onTickerClick={navigateToTicker} />}
            {page === 'accuracy' && <AccuracyPanel />}
            {page === 'tickers' && (
              <TickerView
                initialTicker={focusTicker}
                onNavigated={() => setFocusTicker(null)}
              />
            )}
            {page === 'discovery' && <DiscoveryPanel />}

            {/* Trading pages */}
            {page === 'trade-signals' && <TradingSignals />}
            {page === 'backtest' && <BacktestPanel />}
            {page === 'models' && <ModelPerformance />}
            {page === 'portfolio' && <PortfolioView />}
            {page === 'performance' && <PerformanceAttribution />}
            {page === 'risk' && <RiskDashboard />}
            {page === 'strategies' && <StrategyBuilder />}
            {page === 'charts' && <ChartView />}
            {page === 'watchlists' && <WatchlistManager />}
            {page === 'journal' && <TradeJournal />}
            {page === 'settings' && <SettingsPage />}
            {page === 'dsl-editor' && <StrategyEditor />}
            {page === 'portfolio-backtest' && <PortfolioBacktest />}
            {page === 'trade-replay' && <TradeReplay />}
            {page === 'greeks' && <GreeksCalculator />}
          </div>
        </Layout>
      </TradingSettingsProvider>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </ToastProvider>
  )
}
