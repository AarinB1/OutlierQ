import { useState } from 'react'
import type { Page } from './types'
import Layout from './components/Layout'
import TradingSignals from './components/TradingSignals'
import BacktestPanel from './components/BacktestPanel'
import ModelPerformance from './components/ModelPerformance'
import PortfolioView from './components/PortfolioView'
import RiskDashboard from './components/RiskDashboard'
import StrategyBuilder from './components/StrategyBuilder'
import ChartView from './components/ChartView'

export default function App() {
  const [page, setPage] = useState<Page>('signals')

  const pageComponent = {
    signals: <TradingSignals />,
    backtest: <BacktestPanel />,
    models: <ModelPerformance />,
    portfolio: <PortfolioView />,
    risk: <RiskDashboard />,
    strategy: <StrategyBuilder />,
    chart: <ChartView />,
  }[page]

  return (
    <Layout currentPage={page} onNavigate={setPage}>
      {pageComponent}
    </Layout>
  )
}
