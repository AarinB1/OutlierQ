import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { PricePoint, SignalOverlay, EventOverlay } from '../types'

interface Props {
  prices: PricePoint[]
  signals: SignalOverlay[]
  events: EventOverlay[]
  period: string
  onPeriodChange: (p: string) => void
}

const PERIODS = ['1d', '1w', '1mo', '3mo', '6mo', '1y', '2y'] as const

function formatDate(iso: string, period: string): string {
  const d = new Date(iso)
  if (period === '1d') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (period === '1w' || period === '1mo' || period === '3mo') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface-primary border border-border rounded-lg px-3 py-2 shadow-lg">
      <div className="text-txt-tertiary text-[10px] font-sans mb-1">
        {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono">
        <span className="text-txt-tertiary">O</span><span className="text-txt-primary">${d.open?.toFixed(2)}</span>
        <span className="text-txt-tertiary">H</span><span className="text-accent-green">${d.high?.toFixed(2)}</span>
        <span className="text-txt-tertiary">L</span><span className="text-accent-red">${d.low?.toFixed(2)}</span>
        <span className="text-txt-tertiary">C</span><span className="text-txt-primary">${d.close?.toFixed(2)}</span>
      </div>
      <div className="text-txt-tertiary text-[10px] mt-1 font-mono">
        Vol: {(d.volume / 1_000_000).toFixed(1)}M
      </div>
    </div>
  )
}

export default function PriceChart({ prices, signals, events, period, onPeriodChange }: Props) {
  if (prices.length === 0) {
    return (
      <div className="card flex items-center justify-center h-64">
        <p className="text-txt-tertiary text-sm">No price data available.</p>
      </div>
    )
  }

  const first = prices[0].close
  const last = prices[prices.length - 1].close
  const isUp = last >= first
  const strokeColor = isUp ? '#00e676' : '#ff1744'
  const fillColor = isUp ? 'rgba(0,230,118,0.08)' : 'rgba(255,23,68,0.08)'

  // Map signal/event dates to closest price points for overlay dots
  const signalDots = signals
    .filter(s => s.date)
    .map(s => {
      const closest = prices.reduce((prev, curr) =>
        Math.abs(new Date(curr.date).getTime() - new Date(s.date!).getTime()) <
        Math.abs(new Date(prev.date).getTime() - new Date(s.date!).getTime()) ? curr : prev
      )
      return { ...closest, signal: s }
    })

  const eventDots = events
    .filter(e => e.date)
    .map(e => {
      const closest = prices.reduce((prev, curr) =>
        Math.abs(new Date(curr.date).getTime() - new Date(e.date!).getTime()) <
        Math.abs(new Date(prev.date).getTime() - new Date(e.date!).getTime()) ? curr : prev
      )
      return { ...closest, event: e }
    })

  const minPrice = Math.min(...prices.map(p => p.low)) * 0.995
  const maxPrice = Math.max(...prices.map(p => p.high)) * 1.005

  return (
    <div className="card">
      {/* Period selector */}
      <div className="flex items-center gap-1 mb-4">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all duration-150 ${
              period === p
                ? 'bg-surface-tertiary text-txt-primary'
                : 'text-txt-tertiary hover:text-txt-secondary'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={prices} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={d => formatDate(d, period)}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `$${v.toFixed(0)}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="close"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill="url(#priceGrad)"
            animationDuration={800}
          />
          {/* Signal overlay dots */}
          {signalDots.map((dot, i) => (
            <ReferenceDot
              key={`sig-${i}`}
              x={dot.date}
              y={dot.close}
              r={5}
              fill={dot.signal.direction === 'call' ? '#00e676' : '#ff1744'}
              stroke="#0a0a0f"
              strokeWidth={2}
            />
          ))}
          {/* Event overlay dots */}
          {eventDots.map((dot, i) => (
            <ReferenceDot
              key={`evt-${i}`}
              x={dot.date}
              y={dot.close}
              r={4}
              fill="#448aff"
              stroke="#0a0a0f"
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] font-sans text-txt-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-green" /> Call Signal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-red" /> Put Signal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-blue" /> Event
        </span>
      </div>
    </div>
  )
}
