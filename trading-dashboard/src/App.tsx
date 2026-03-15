import { useState } from 'react'
import Layout from './components/Layout'
import TradingSignals from './components/TradingSignals'
import BacktestPanel from './components/BacktestPanel'
import ModelPerformance from './components/ModelPerformance'
import PortfolioView from './components/PortfolioView'
import RiskDashboard from './components/RiskDashboard'
import StrategyBuilder from './components/StrategyBuilder'
import ChartView from './components/ChartView'

export type Page =
  | 'signals'
  | 'backtest'
  | 'models'
  | 'portfolio'
  | 'risk'
  | 'strategy'
  | 'charts'

export default function App() {
  const [page, setPage] = useState<Page>('signals')

  return (
    <Layout page={page} setPage={setPage}>
      <div key={page} className="animate-fade-in">
        {page === 'signals' && <TradingSignals />}
        {page === 'backtest' && <BacktestPanel />}
        {page === 'models' && <ModelPerformance />}
        {page === 'portfolio' && <PortfolioView />}
        {page === 'risk' && <RiskDashboard />}
        {page === 'strategy' && <StrategyBuilder />}
        {page === 'charts' && <ChartView />}
      </div>
    </Layout>
  )
}

