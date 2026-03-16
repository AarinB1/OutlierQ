import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchPerformanceAttribution } from '../../api'
import type { PerformanceAttribution } from '../../types'
import { useToast } from '../../hooks/useToast'
import EmptyState from './EmptyState'

export default function PerformanceAttributionPage() {
  const { addToast } = useToast()
  const [data, setData] = useState<PerformanceAttribution | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        setData(await fetchPerformanceAttribution())
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load performance data'
        addToast('error', 'Performance error', message)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [addToast])

  const byStrategy = useMemo(
    () =>
      Object.entries(data?.by_strategy ?? {}).map(([strategy, values]) => ({
        strategy,
        ...values,
      })),
    [data],
  )

  const byExit = useMemo(
    () =>
      Object.entries(data?.by_exit_reason ?? {}).map(([reason, values]) => ({
        reason,
        ...values,
      })),
    [data],
  )

  const bestStrategy = useMemo(() => {
    if (byStrategy.length === 0) return '—'
    return [...byStrategy].sort((a, b) => b.win_rate - a.win_rate)[0].strategy
  }, [byStrategy])

  const totalPnl = byStrategy.reduce((sum, row) => sum + row.total_pnl, 0)
  const totalWins = byStrategy.reduce((sum, row) => sum + row.wins, 0)
  const overallWinRate = data?.total_executions ? (totalWins / data.total_executions) * 100 : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="font-mono font-bold text-lg">Performance</h2>
        <div className="card space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="skeleton h-14 w-full rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.total_executions === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="📊"
          title="No performance data yet"
          subtitle="Run backtests or execute paper trades to see strategy attribution, win rates, and rolling accuracy."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="font-mono font-bold text-lg">Performance</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Trades" value={String(data.total_executions)} />
        <SummaryCard label="Overall Win Rate" value={`${overallWinRate.toFixed(1)}%`} />
        <SummaryCard
          label="Total P&L"
          value={`$${totalPnl.toFixed(2)}`}
          className={totalPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        <SummaryCard label="Best Strategy" value={bestStrategy} />
      </div>

      <div className="card">
        <h3 className="font-mono font-semibold text-sm mb-3">P&amp;L by Strategy</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStrategy} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis type="number" stroke="#666" />
              <YAxis type="category" dataKey="strategy" stroke="#666" width={110} />
              <Tooltip />
              <Bar dataKey="total_pnl">
                {byStrategy.map((row) => (
                  <Cell key={row.strategy} fill={row.total_pnl >= 0 ? '#00d68f' : '#ff3d5a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto mt-4 text-xs">
          <table className="w-full min-w-[720px]">
            <thead className="text-txt-tertiary">
              <tr>
                <th className="py-2 text-left">Strategy</th>
                <th className="py-2 text-right">Trades</th>
                <th className="py-2 text-right">Wins</th>
                <th className="py-2 text-right">Losses</th>
                <th className="py-2 text-right">Win Rate %</th>
                <th className="py-2 text-right">Total P&amp;L</th>
                <th className="py-2 text-right">Avg P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {byStrategy.map((row) => (
                <tr key={row.strategy} className="border-t border-border/40">
                  <td className="py-2">{row.strategy}</td>
                  <td className="py-2 text-right">{row.total}</td>
                  <td className="py-2 text-right">{row.wins}</td>
                  <td className="py-2 text-right">{row.losses}</td>
                  <td className="py-2 text-right">{row.win_rate.toFixed(1)}</td>
                  <td className="py-2 text-right">{row.total_pnl.toFixed(2)}</td>
                  <td className="py-2 text-right">{row.avg_pnl.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="font-mono font-semibold text-sm mb-3">P&amp;L by Direction</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['BUY', 'SHORT'] as const).map((direction) => {
            const row = data.by_direction[direction] ?? { total: 0, wins: 0, total_pnl: 0, win_rate: 0 }
            return (
              <div key={direction} className="card">
                <div className="font-mono font-bold text-lg mb-2">{direction} Performance</div>
                <div className="text-sm text-txt-secondary">Trades: {row.total}</div>
                <div className="text-sm text-txt-secondary">Win Rate: {row.win_rate.toFixed(1)}%</div>
                <div className={row.total_pnl >= 0 ? 'text-accent-green font-mono mt-2' : 'text-accent-red font-mono mt-2'}>
                  ${row.total_pnl.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h3 className="font-mono font-semibold text-sm mb-3">Exit Reason Breakdown</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byExit} dataKey="total" nameKey="reason" outerRadius={100} label>
                {byExit.map((entry, idx) => (
                  <Cell key={entry.reason} fill={['#448aff', '#00d68f', '#ffab00', '#ff3d5a', '#a855f7'][idx % 5]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 className="font-mono font-semibold text-sm mb-3">Rolling 20-Trade Accuracy</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.rolling_accuracy}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="trade_index" stroke="#666" />
              <YAxis stroke="#666" domain={[0, 100]} />
              <Tooltip />
              <ReferenceLine y={50} stroke="#ffab00" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="accuracy" stroke="#00d68f" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="card">
      <div className="label mb-1">{label}</div>
      <div className={`font-mono font-bold text-xl ${className ?? ''}`}>{value}</div>
    </div>
  )
}
