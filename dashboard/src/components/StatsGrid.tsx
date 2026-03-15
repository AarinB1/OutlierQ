import type { KeyStats } from '../types'

interface Props {
  stats: KeyStats
}

function StatItem({ label, value, suffix = '%' }: { label: string; value: number | null; suffix?: string }) {
  if (value == null) {
    return (
      <div className="card text-center">
        <div className="stat-number text-txt-tertiary mb-1">{'\u2014'}</div>
        <div className="label">{label}</div>
      </div>
    )
  }

  const isPositive = value >= 0
  const color = suffix === '%' && label !== 'Volatility'
    ? (isPositive ? 'text-accent-green' : 'text-accent-red')
    : 'text-txt-primary'

  return (
    <div className="card text-center">
      <div className={`stat-number ${color} mb-1`}>
        {isPositive && suffix === '%' && label !== 'Volatility' ? '+' : ''}{value.toFixed(1)}{suffix}
      </div>
      <div className="label">{label}</div>
    </div>
  )
}

export default function StatsGrid({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatItem label="1 Week" value={stats.weekly_return} />
      <StatItem label="1 Month" value={stats.monthly_return} />
      <StatItem label="YTD" value={stats.ytd_return} />
      <StatItem label="Volatility" value={stats.volatility_30d} />
    </div>
  )
}
