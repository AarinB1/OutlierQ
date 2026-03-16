import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchHealth } from './api'
import type { HealthStatus } from './types'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import ShortcutsModal from './components/ShortcutsModal'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
// Options pages
import SignalList from './components/SignalList'
import EventTimeline from './components/EventTimeline'
import AccuracyPanel from './components/AccuracyPanel'
import TickerView from './components/TickerView'
import DiscoveryPanel from './components/DiscoveryPanel'
// Trading pages
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

function AppContent() {
  const [section, setSection] = useState<Section>('options')
  const [page, setPage] = useState<Page>('signals')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [focusTicker, setFocusTicker] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

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

  const shortcuts = useMemo(() => ({
    's': () => { setSection('options'); setPage('signals') },
    'e': () => { setSection('options'); setPage('events') },
    'a': () => { setSection('options'); setPage('accuracy') },
    't': () => { setSection('options'); setPage('tickers') },
    'd': () => { setSection('options'); setPage('discovery') },
    '/': () => {
      const el = document.getElementById('signal-ticker-search') || document.getElementById('event-ticker-search')
      el?.focus()
    },
    '?': () => setShortcutsOpen(v => !v),
  }), [])

  useKeyboardShortcuts(shortcuts)

  return (
    <>
      <Layout
        section={section}
        setSection={handleSectionChange}
        page={page}
        setPage={setPage}
        connected={connected}
        health={health}
      >
        <div key={page} className="animate-fade-in">
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

          {page === 'trade-signals' && <TradingSignals />}
          {page === 'backtest' && <BacktestPanel />}
          {page === 'models' && <ModelPerformance />}
          {page === 'portfolio' && <PortfolioView />}
          {page === 'risk' && <RiskDashboard />}
          {page === 'strategies' && <StrategyBuilder />}
          {page === 'charts' && <ChartView />}
        </div>
      </Layout>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
