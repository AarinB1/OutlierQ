import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, PieChart, Pie, Cell } from 'recharts'
import { fetchPerformanceAttribution } from '../../api'
import type { PerformanceAttribution as PerfData } from '../../types'
import EmptyState from './EmptyState'

const COLORS = ['#448aff', '#00d68f', '#ff3d5a', '#ffb300', '#ab47bc', '#26a69a']

export default function PerformanceAttribution() {
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPerformanceAttribution()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="font-mono font-bold text-lg">Performance Attribution</h2>
        <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <div key={i} className="card"><div className="skeleton h-20 w-full" /></div>)}</div>
      </div>
    )
  }

  if (!data || data.total_executions === 0) {
    return (
      <div>
        <h2 className="font-mono font-bold text-lg mb-4">Performance Attribution</h2>
        <EmptyState icon="◈" title="No trade data yet" subtitle="Performance attribution will appear after trades are executed. Run the paper trading bot or complete backtests to generate trade data." />
      </div>
    )
  }

  const strategies = Object.entries(data.by_strategy)
  const totalTrades = data.total_executions
  const overallWins = strategies.reduce((s, [, d]) => s + d.wins, 0)
  const overallWinRate = totalTrades > 0 ? (overallWins / totalTrades * 100).toFixed(1) : '0'
  const totalPnl = strategies.reduce((s, [, d]) => s + d.total_pnl, 0)
  const bestStrategy = strategies.sort((a, b) => b[1].win_rate - a[1].win_rate)[0]?.[0] || '—'

  const strategyChartData = Object.entries(data.by_strategy).map(([name, d]) => ({
    name, total_pnl: d.total_pnl, fill: d.total_pnl >= 0 ? '#00d68f' : '#ff3d5a',
  }))

  const exitData = Object.entries(data.by_exit_reason).map(([name, d], i) => ({
    name, value: d.total, fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-4">
      <h2 className="font-mono font-bold text-lg">Performance Attribution</h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center py-3">
          <div className="text-xs text-txt-tertiary">Total Trades</div>
          <div className="font-mono font-bold text-lg">{totalTrades}</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-txt-tertiary">Win Rate</div>
          <div className="font-mono font-bold text-lg">{overallWinRate}%</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-txt-tertiary">Total P&L</div>
          <div className={`font-mono font-bold text-lg ${totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>${totalPnl.toFixed(2)}</div>
        </div>
        <div className="card text-center py-3">
          <div className="text-xs text-txt-tertiary">Best Strategy</div>
          <div className="font-mono font-bold text-sm">{bestStrategy}</div>
        </div>
      </div>

      {/* P&L by Strategy */}
      <div className="card">
        <h3 className="font-mono font-bold text-sm mb-3">P&L by Strategy</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={strategyChartData} layout="vertical">
            <XAxis type="number" tick={{ fill: '#c9c9d4', fontSize: 11 }} />
            <YAxis dataKey="name" type="category" tick={{ fill: '#c9c9d4', fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }} />
            <Bar dataKey="total_pnl" name="P&L" />
          </BarChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-txt-tertiary border-b border-border">
                <th className="text-left py-2">Strategy</th><th className="text-right">Trades</th><th className="text-right">Wins</th><th className="text-right">Losses</th>
                <th className="text-right">Win Rate</th><th className="text-right">Total P&L</th><th className="text-right">Avg P&L</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.by_strategy).map(([name, d]) => (
                <tr key={name} className="border-b border-border/50">
                  <td className="py-2 font-mono">{name}</td>
                  <td className="text-right">{d.total}</td>
                  <td className="text-right text-accent-green">{d.wins}</td>
                  <td className="text-right text-accent-red">{d.losses}</td>
                  <td className="text-right">{d.win_rate}%</td>
                  <td className={`text-right font-mono ${d.total_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>${d.total_pnl.toFixed(2)}</td>
                  <td className="text-right font-mono">${d.avg_pnl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* P&L by Direction */}
      <div className="card">
        <h3 className="font-mono font-bold text-sm mb-3">P&L by Direction</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(data.by_direction).map(([dir, d]) => (
            <div key={dir} className="card bg-surface-tertiary text-center py-4">
              <div className="text-xs text-txt-tertiary mb-1">{dir} Performance</div>
              <div className="font-mono font-bold text-lg">{d.total} trades</div>
              <div className="text-sm text-txt-secondary">Win Rate: {d.win_rate}%</div>
              <div className={`font-mono font-bold ${d.total_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>${d.total_pnl.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Exit Reason */}
      {exitData.length > 0 && (
        <div className="card">
          <h3 className="font-mono font-bold text-sm mb-3">Exit Reason Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={exitData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {exitData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rolling Accuracy */}
      {data.rolling_accuracy.length > 0 && (
        <div className="card">
          <h3 className="font-mono font-bold text-sm mb-3">Rolling 20-Trade Accuracy</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.rolling_accuracy}>
              <XAxis dataKey="trade_index" tick={{ fill: '#c9c9d4', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#c9c9d4', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }} />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="accuracy" stroke="#448aff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
