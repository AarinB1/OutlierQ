import { useState, useEffect } from 'react'
import { fetchHealth } from './api'
import type { HealthStatus } from './types'
import Layout from './components/Layout'
import SignalList from './components/SignalList'
import EventTimeline from './components/EventTimeline'
import AccuracyPanel from './components/AccuracyPanel'
import TickerView from './components/TickerView'

type Page = 'signals' | 'events' | 'accuracy' | 'tickers'

export default function App() {
  const [page, setPage] = useState<Page>('signals')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [connected, setConnected] = useState(false)

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

  return (
    <Layout page={page} setPage={setPage} connected={connected} health={health}>
      {page === 'signals' && <SignalList />}
      {page === 'events' && <EventTimeline />}
      {page === 'accuracy' && <AccuracyPanel />}
      {page === 'tickers' && <TickerView />}
    </Layout>
  )
}
