import { useState, useEffect, useCallback } from 'react'
import { fetchHealth } from './api'
import type { HealthStatus } from './types'
import Layout from './components/Layout'
import SignalList from './components/SignalList'
import EventTimeline from './components/EventTimeline'
import AccuracyPanel from './components/AccuracyPanel'
import TickerView from './components/TickerView'
import DiscoveryPanel from './components/DiscoveryPanel'

export type Page = 'signals' | 'events' | 'accuracy' | 'tickers' | 'discovery'

export default function App() {
  const [page, setPage] = useState<Page>('signals')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [focusTicker, setFocusTicker] = useState<string | null>(null)

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
  }, [])

  return (
    <Layout page={page} setPage={setPage} connected={connected} health={health}>
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
      </div>
    </Layout>
  )
}
