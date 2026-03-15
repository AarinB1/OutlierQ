import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { PortfolioData } from '../types'
import { api } from '../api'

const COLORS = ['#448aff', '#00e676', '#ffab00', '#ff1744', '#b388ff', '#00bcd4']

export default function PortfolioView() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPortfolio()
      .then(setPortfolio)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}</div>
  }

  if (!portfolio) {
    return <div className="card text-center py-12 text-txt-secondary">Unable to load portfolio data</div>
  }

  const positionData = portfolio.positions.map((p) => ({
    name: p.ticker,
    value: p.quantity * p.current_price,
  }))

  return (
    <div>
      <h2 className="text-2xl font-bold font-sans mb-6">Portfolio</h2>

      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="label mb-2">Total Value</div>
          <div className="stat-number">${portfolio.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="card">
          <div className="label mb-2">Cash</div>
          <div className="stat-number text-accent-blue">${portfolio.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="card">
          <div className="label mb-2">Daily P&L</div>
          <div className={`stat-number ${portfolio.daily_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {portfolio.daily_pnl >= 0 ? '+' : ''}${portfolio.daily_pnl.toFixed(0)}
          </div>
        </div>
        <div className="card">
          <div className="label mb-2">Cumulative P&L</div>
          <div className={`stat-number ${portfolio.cumulative_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {portfolio.cumulative_pnl >= 0 ? '+' : ''}${portfolio.cumulative_pnl.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Positions table */}
        <div className="card">
          <h3 className="text-lg font-bold mb-4">Open Positions ({portfolio.positions.length})</h3>
          {portfolio.positions.length === 0 ? (
            <p className="text-txt-secondary text-sm text-center py-8">No open positions</p>
          ) : (
            <table className="w-full text-sm font-mono">
              <thead className="text-txt-tertiary text-xs uppercase">
                <tr>
                  <th className="text-left py-2">Ticker</th>
                  <th className="text-left py-2">Dir</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Entry</th>
                  <th className="text-right py-2">Current</th>
                  <th className="text-right py-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 font-bold">{p.ticker}</td>
                    <td className={p.direction === 'BUY' ? 'text-accent-green' : 'text-accent-red'}>{p.direction}</td>
                    <td className="text-right">{p.quantity}</td>
                    <td className="text-right">${p.entry_price.toFixed(2)}</td>
                    <td className="text-right">${p.current_price.toFixed(2)}</td>
                    <td className={`text-right ${p.unrealized_pnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      ${p.unrealized_pnl.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Allocation pie */}
        <div className="card">
          <h3 className="text-lg font-bold mb-4">Allocation</h3>
          {positionData.length === 0 ? (
            <p className="text-txt-secondary text-sm text-center py-8">100% Cash</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={positionData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {positionData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#12121a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={(value: number) => [`$${value.toFixed(0)}`, 'Value']}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Max drawdown */}
      <div className="card">
        <div className="flex items-center gap-4">
          <span className="label">Max Drawdown</span>
          <span className="font-mono font-bold text-accent-red text-xl">
            {(portfolio.max_drawdown * 100).toFixed(1)}%
          </span>
          <div className="flex-1 h-3 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-red rounded-full"
              style={{ width: `${Math.min(portfolio.max_drawdown * 100 * 10, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
