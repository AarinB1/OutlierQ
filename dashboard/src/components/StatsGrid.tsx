import type { KeyStats } from '../types'

interface Props {
  stats: KeyStats
}

function StatItem({ index, label, value, suffix = '%' }: { index: number; label: string; value: number | null; suffix?: string }) {
  const signed = suffix === '%' && label !== 'Volatility'
  const color = value == null
    ? 'text-txt-tertiary'
    : signed
      ? (value >= 0 ? 'text-accent-green' : 'text-accent-red')
      : 'text-txt-primary'

  return (
    <div className="bg-surface-secondary p-5">
      <div className="flex items-baseline justify-between mb-3">
        <span className="label">{label}</span>
        <span className="font-mono text-[10px] tracking-widest text-txt-tertiary">
          {String(index).padStart(2, '0')}
        </span>
      </div>
      <div className={`stat-number text-3xl ${color}`}>
        {value == null
          ? '—'
          : `${signed && value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`}
      </div>
    </div>
  )
}

export default function StatsGrid({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-card overflow-hidden border border-border bg-white/5">
      <StatItem index={1} label="1 Week" value={stats.weekly_return} />
      <StatItem index={2} label="1 Month" value={stats.monthly_return} />
      <StatItem index={3} label="YTD" value={stats.ytd_return} />
      <StatItem index={4} label="Volatility" value={stats.volatility_30d} />
    </div>
  )
}
