import { useState } from 'react'
import Layout from './components/Layout'
import TradingSignals from './components/TradingSignals'
import BacktestPanel from './components/BacktestPanel'
import ModelPerformance from './components/ModelPerformance'
import PortfolioView from './components/PortfolioView'
import RiskDashboard from './components/RiskDashboard'
import StrategyBuilder from './components/StrategyBuilder'
import ChartView from './components/ChartView'
import WatchlistManager from './components/WatchlistManager'
import TradeJournal from './components/TradeJournal'
import PerformanceAttribution from './components/PerformanceAttribution'
import SettingsPage from './components/SettingsPage'
import { ToastProvider } from './components/Toast'

export type Page =
  | 'signals'
  | 'backtest'
  | 'models'
  | 'portfolio'
  | 'performance'
  | 'risk'
  | 'strategy'
  | 'charts'
  | 'watchlists'
  | 'journal'
  | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('signals')

  return (
    <ToastProvider>
      <Layout page={page} setPage={setPage}>
        <div key={page} className="animate-fade-in">
          {page === 'signals' && <TradingSignals />}
          {page === 'backtest' && <BacktestPanel />}
          {page === 'models' && <ModelPerformance />}
          {page === 'portfolio' && <PortfolioView />}
          {page === 'performance' && <PerformanceAttribution />}
          {page === 'risk' && <RiskDashboard />}
          {page === 'strategy' && <StrategyBuilder />}
          {page === 'charts' && <ChartView />}
          {page === 'watchlists' && <WatchlistManager />}
          {page === 'journal' && <TradeJournal />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </Layout>
    </ToastProvider>
  )
}

