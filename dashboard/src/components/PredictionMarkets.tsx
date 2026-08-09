import { useEffect, useState, useCallback } from 'react'
import {
  fetchPredictionMarkets,
  fetchPredictionHistory,
  fetchPredictionStats,
  scanPredictions,
  scanArbitrage,
  fetchArbitrageHistory,
  updateArbitrageStatus,
} from '../api'
import type {
  PredictionMarket as PredMarket,
  PredictionRecord as PredRecord,
  PredictionStats as PredStats,
  ArbitrageOpportunity as ArbOpportunity,
} from '../types'

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function platformBadge(p: string): string {
  return p === 'polymarket'
    ? 'bg-[#6366f1]/15 text-[#818cf8]'
    : 'bg-[#f59e0b]/15 text-[#f59e0b]'
}

function outcomePill(outcome: string): string {
  return outcome === 'yes'
    ? 'bg-accent-green-muted text-accent-green'
    : 'bg-accent-red-muted text-accent-red'
}

export default function PredictionMarkets() {
  const [tab, setTab] = useState<'markets' | 'predictions' | 'arbitrage' | 'stats'>('markets')
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [markets, setMarkets] = useState<PredMarket[]>([])
  const [predictions, setPredictions] = useState<PredRecord[]>([])
  const [arbOpps, setArbOpps] = useState<ArbOpportunity[]>([])
  const [stats, setStats] = useState<PredStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [arbScanning, setArbScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const loadMarkets = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchPredictionMarkets(platformFilter || undefined)
      .then((d) => setMarkets(d.markets ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load markets'))
      .finally(() => setLoading(false))
  }, [platformFilter])

  const loadPredictions = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchPredictionHistory({ limit: 100, platform: platformFilter || undefined })
      .then((d) => setPredictions(d.predictions ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load predictions'))
      .finally(() => setLoading(false))
  }, [platformFilter])

  const loadArbitrage = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchArbitrageHistory({ limit: 100 })
      .then((d) => setArbOpps(d.opportunities ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load arbitrage'))
      .finally(() => setLoading(false))
  }, [])

  const loadStats = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchPredictionStats()
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'markets') loadMarkets()
    else if (tab === 'predictions') loadPredictions()
    else if (tab === 'arbitrage') loadArbitrage()
    else loadStats()
  }, [tab, loadMarkets, loadPredictions, loadArbitrage, loadStats])

  const handleScan = () => {
    setScanning(true)
    setScanResult(null)
    scanPredictions({ platform: platformFilter || undefined })
      .then((d) => {
        setScanResult(`Generated ${d.count} prediction(s)`)
        if (tab === 'predictions') loadPredictions()
      })
      .catch((e: unknown) => setScanResult(e instanceof Error ? e.message : 'Scan failed'))
      .finally(() => setScanning(false))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">Prediction Markets</h2>
          <p className="text-sm text-txt-secondary mt-1">
            Polymarket & Kalshi markets matched to OutlierQ events
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-surface-secondary border border-border rounded-lg px-3 py-2 text-sm text-txt-primary font-mono"
          >
            <option value="">All Platforms</option>
            <option value="polymarket">Polymarket</option>
            <option value="kalshi">Kalshi</option>
          </select>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 rounded-lg bg-accent-blue text-surface-primary text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Scanning...' : 'Scan Markets'}
          </button>
        </div>
      </div>

      {tab === 'arbitrage' && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setArbScanning(true)
              setScanResult(null)
              scanArbitrage()
                .then((d) => {
                  setScanResult(`Found ${d.count} arbitrage opportunit${d.count === 1 ? 'y' : 'ies'}`)
                  loadArbitrage()
                })
                .catch((e: unknown) => setScanResult(e instanceof Error ? e.message : 'Scan failed'))
                .finally(() => setArbScanning(false))
            }}
            disabled={arbScanning}
            className="px-4 py-2 rounded-lg bg-accent-amber text-white text-sm font-medium hover:bg-accent-amber/90 disabled:opacity-50 transition-colors"
          >
            {arbScanning ? 'Scanning...' : 'Scan Arbitrage'}
          </button>
        </div>
      )}

      {scanResult && (
        <div className="card border border-accent-blue/20 bg-accent-blue/10 p-3 text-sm text-txt-primary">
          {scanResult}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-tertiary rounded-lg p-1 w-fit">
        {(['markets', 'predictions', 'arbitrage', 'stats'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t
                ? 'bg-surface-primary text-txt-primary shadow-sm'
                : 'text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            {t === 'markets' ? 'Active Markets' : t === 'predictions' ? 'Bot Predictions' : t === 'arbitrage' ? 'Arbitrage' : 'Accuracy'}
          </button>
        ))}
      </div>

      {error && (
        <div className="card border border-accent-red/20 bg-accent-red/10 p-4 text-sm text-accent-red">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      )}

      {/* Active Markets Tab */}
      {!loading && tab === 'markets' && (
        <div className="space-y-3">
          {markets.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-txt-tertiary text-lg mb-2">No markets found</p>
              <p className="text-txt-secondary text-sm">Try adjusting the platform filter or check API connectivity.</p>
            </div>
          ) : (
            markets.map((m) => (
              <div key={m.market_id} className="card p-4 hover:border-border/80 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${platformBadge(m.platform)}`}>
                        {m.platform === 'polymarket' ? 'PM' : 'KA'}
                      </span>
                      {m.category && (
                        <span className="text-xs text-txt-tertiary">{m.category}</span>
                      )}
                    </div>
                    <p className="text-sm text-txt-primary font-medium leading-snug">{m.question}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-[10px] text-txt-tertiary uppercase">Yes</p>
                        <p className="font-mono text-sm text-accent-green font-semibold">{pct(m.yes_price)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-txt-tertiary uppercase">No</p>
                        <p className="font-mono text-sm text-accent-red font-semibold">{pct(m.no_price)}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-txt-tertiary font-mono">
                      Vol: ${m.volume >= 1_000_000 ? `${(m.volume / 1_000_000).toFixed(1)}M` : `${(m.volume / 1_000).toFixed(0)}K`}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bot Predictions Tab */}
      {!loading && tab === 'predictions' && (
        <div className="space-y-3">
          {predictions.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-txt-tertiary text-lg mb-2">No predictions yet</p>
              <p className="text-txt-secondary text-sm">Click "Scan Markets" to generate predictions from recent events.</p>
            </div>
          ) : (
            predictions.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${platformBadge(p.platform)}`}>
                        {p.platform === 'polymarket' ? 'PM' : 'KA'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${outcomePill(p.predicted_outcome)}`}>
                        {p.predicted_outcome.toUpperCase()}
                      </span>
                      {p.actual_outcome !== null && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.is_correct ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
                          {p.is_correct ? 'CORRECT' : 'WRONG'}
                        </span>
                      )}
                      {p.matched_event_type && (
                        <span className="text-[10px] text-txt-tertiary bg-surface-tertiary px-1.5 py-0.5 rounded">
                          {p.matched_event_type}
                        </span>
                      )}
                      {p.matched_tickers && (
                        <span className="text-[10px] font-mono text-accent-blue">{p.matched_tickers}</span>
                      )}
                      {p.simulation_enhanced && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400">
                          MiroFish
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-txt-primary leading-snug">{p.question}</p>
                    {p.created_at && (
                      <p className="text-[10px] text-txt-tertiary mt-1">
                        {new Date(p.created_at).toLocaleDateString()} via {p.platform}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1 min-w-[120px]">
                    <div className="grid grid-cols-2 gap-x-3 text-xs">
                      <div>
                        <p className="text-[10px] text-txt-tertiary">Bot</p>
                        <p className="font-mono font-semibold text-txt-primary">{pct(p.predicted_probability)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-txt-tertiary">Market</p>
                        <p className="font-mono font-semibold text-txt-secondary">{pct(p.market_probability)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 text-xs">
                      <div>
                        <p className="text-[10px] text-txt-tertiary">Edge</p>
                        <p className={`font-mono font-semibold ${p.edge > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                          {p.edge > 0 ? '+' : ''}{pct(p.edge)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-txt-tertiary">Conf</p>
                        <p className="font-mono font-semibold text-txt-primary">{pct(p.confidence)}</p>
                      </div>
                    </div>
                    {p.pnl_if_bet !== null && (
                      <p className={`text-[10px] font-mono ${p.pnl_if_bet >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        P&L: {p.pnl_if_bet >= 0 ? '+' : ''}{p.pnl_if_bet.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                {p.simulation_enhanced && p.sim_estimated_probability != null && (
                  <div className="mt-2 p-2 rounded bg-surface-tertiary text-xs text-txt-secondary">
                    <span className="text-txt-tertiary">Sim estimate:</span>{' '}
                    <span className="font-mono">{(p.sim_estimated_probability * 100).toFixed(1)}%</span>
                    <span className="mx-2 text-txt-tertiary">|</span>
                    <span className="text-txt-tertiary">Consensus:</span>{' '}
                    <span className="font-mono">{((p.sim_consensus_strength ?? 0) * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Arbitrage Tab */}
      {!loading && tab === 'arbitrage' && (
        <div className="space-y-3">
          {arbOpps.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-txt-tertiary text-lg mb-2">No arbitrage opportunities</p>
              <p className="text-txt-secondary text-sm">Click "Scan Arbitrage" to find cross-platform price discrepancies.</p>
            </div>
          ) : (
            arbOpps.map((opp) => (
              <div key={opp.id} className="card border-l-4 border-accent-amber p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      opp.spread_pct >= 0.1
                        ? 'bg-accent-amber/20 text-accent-amber'
                        : 'bg-surface-tertiary text-txt-secondary'
                    }`}>
                      {opp.spread_pct >= 0.1 ? 'HIGH' : 'MODERATE'} SPREAD
                    </span>
                    <span className="text-[10px] text-txt-tertiary bg-surface-tertiary px-1.5 py-0.5 rounded">
                      {opp.match_method} ({(opp.match_score * 100).toFixed(0)}%)
                    </span>
                    {opp.status !== 'open' && (
                      <span className="text-[10px] text-txt-tertiary bg-surface-tertiary px-1.5 py-0.5 rounded uppercase">
                        {opp.status}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-lg font-bold text-accent-green">
                    +{(opp.spread * 100).toFixed(1)}c
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {/* Polymarket side */}
                  <div className="p-3 rounded-lg bg-surface-secondary">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${platformBadge('polymarket')}`}>PM</span>
                      <span className="text-txt-tertiary text-[10px]">Polymarket</span>
                    </div>
                    <p className="text-txt-primary text-xs mb-2 leading-snug">{opp.poly_question}</p>
                    <div className="font-mono font-bold text-lg text-txt-primary">
                      {(opp.poly_yes_price * 100).toFixed(1)}c
                      <span className="text-txt-tertiary text-xs ml-1">YES</span>
                    </div>
                    <p className="text-txt-tertiary text-[10px] font-mono">
                      Vol: ${opp.poly_volume >= 1_000_000 ? `${(opp.poly_volume / 1_000_000).toFixed(1)}M` : `${(opp.poly_volume / 1_000).toFixed(0)}K`}
                    </p>
                  </div>

                  {/* Kalshi side */}
                  <div className="p-3 rounded-lg bg-surface-secondary">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${platformBadge('kalshi')}`}>KA</span>
                      <span className="text-txt-tertiary text-[10px]">Kalshi</span>
                    </div>
                    <p className="text-txt-primary text-xs mb-2 leading-snug">{opp.kalshi_question}</p>
                    <div className="font-mono font-bold text-lg text-txt-primary">
                      {(opp.kalshi_yes_price * 100).toFixed(1)}c
                      <span className="text-txt-tertiary text-xs ml-1">YES</span>
                    </div>
                    <p className="text-txt-tertiary text-[10px] font-mono">
                      Vol: ${opp.kalshi_volume >= 1_000_000 ? `${(opp.kalshi_volume / 1_000_000).toFixed(1)}M` : `${(opp.kalshi_volume / 1_000).toFixed(0)}K`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex justify-between items-center text-xs">
                  <span className="font-mono text-txt-secondary">
                    {opp.direction === 'buy_poly_yes' ? 'Buy Polymarket YES' : 'Buy Kalshi YES'}
                  </span>
                  <div className="flex items-center gap-2">
                    {opp.status === 'open' && (
                      <button
                        onClick={() => {
                          updateArbitrageStatus(opp.id, 'false_positive')
                            .then(() => loadArbitrage())
                            .catch(() => {})
                        }}
                        className="text-[10px] text-txt-tertiary hover:text-accent-red transition-colors"
                      >
                        False positive
                      </button>
                    )}
                    {opp.profit_after_fees != null ? (
                      <span
                        className={`font-mono font-semibold ${opp.profit_after_fees > 0 ? 'text-accent-green' : 'text-txt-tertiary'}`}
                        title={`Raw spread $${opp.theoretical_profit.toFixed(3)} minus ~$${(opp.estimated_fees ?? 0).toFixed(3)} Kalshi fees`}
                      >
                        {opp.profit_after_fees > 0 ? '+' : ''}${opp.profit_after_fees.toFixed(3)}/unit after fees
                      </span>
                    ) : (
                      <span
                        className="font-mono text-txt-tertiary"
                        title="Fee estimate unavailable for this legacy opportunity"
                      >
                        ${opp.theoretical_profit.toFixed(3)}/unit gross (fees unavailable)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Stats Tab */}
      {!loading && tab === 'stats' && stats && (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total', value: String(stats.total) },
              { label: 'Correct', value: String(stats.correct) },
              { label: 'Accuracy', value: stats.total > 0 ? pct(stats.accuracy) : '--' },
              { label: 'Avg Edge', value: stats.total > 0 ? pct(stats.avg_edge) : '--' },
              { label: 'Avg P&L', value: stats.total > 0 ? `$${stats.avg_pnl.toFixed(3)}` : '--' },
            ].map((s) => (
              <div key={s.label} className="card p-4 text-center">
                <p className="text-[10px] text-txt-tertiary uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-lg font-mono font-semibold text-txt-primary">{s.value}</p>
              </div>
            ))}
          </div>

          {/* By Platform */}
          {Object.keys(stats.by_platform).length > 0 && (
            <div className="card p-5">
              <h3 className="label mb-3">By Platform</h3>
              <div className="space-y-2">
                {Object.entries(stats.by_platform).map(([plat, d]) => (
                  <div key={plat} className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${platformBadge(plat)}`}>
                      {plat}
                    </span>
                    <span className="font-mono text-txt-primary">
                      {d.correct}/{d.total} ({pct(d.accuracy)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By Event Type */}
          {Object.keys(stats.by_event_type).length > 0 && (
            <div className="card p-5">
              <h3 className="label mb-3">By Event Type</h3>
              <div className="space-y-2">
                {Object.entries(stats.by_event_type).map(([et, d]) => (
                  <div key={et} className="flex items-center justify-between text-sm">
                    <span className="text-txt-secondary">{et}</span>
                    <span className="font-mono text-txt-primary">
                      {d.correct}/{d.total} ({pct(d.accuracy)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.total === 0 && (
            <div className="card p-12 text-center">
              <p className="text-txt-tertiary text-lg mb-2">No resolved predictions yet</p>
              <p className="text-txt-secondary text-sm">Accuracy stats appear once markets resolve.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
