import type { CompanyInfo } from '../types'

interface Props {
  info: CompanyInfo
  onBack: () => void
}

function formatMarketCap(n: number | null): string {
  if (n == null) return '\u2014'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

export default function StockHeader({ info, onBack }: Props) {
  const isUp = (info.change ?? 0) >= 0

  return (
    <div className="mb-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-txt-tertiary text-xs font-sans hover:text-txt-secondary transition-colors duration-150 mb-4 flex items-center gap-1"
      >
        {'\u2190'} All Tickers
      </button>

      {/* Ticker + Name */}
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="font-mono font-bold text-3xl text-txt-primary tracking-tight">
          {info.ticker}
        </h2>
        <span className="text-txt-secondary text-sm font-sans">{info.name}</span>
      </div>

      {/* Price + Change */}
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono text-2xl text-txt-primary">
          ${info.current_price?.toFixed(2) ?? '\u2014'}
        </span>
        {info.change != null && (
          <span className={`font-mono text-sm ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
            {isUp ? '+' : ''}{info.change.toFixed(2)} ({isUp ? '+' : ''}{info.change_percent?.toFixed(2)}%)
          </span>
        )}
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap gap-3 text-[11px] font-sans">
        {info.sector && (
          <span className="px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-secondary">
            {info.sector}
          </span>
        )}
        <span className="px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-secondary">
          MCap {formatMarketCap(info.market_cap)}
        </span>
        {info.beta != null && (
          <span className="px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-secondary">
            Beta {info.beta.toFixed(2)}
          </span>
        )}
        {info.day_high != null && info.day_low != null && (
          <span className="px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-tertiary">
            {`Day: $${info.day_low.toFixed(2)} \u2013 $${info.day_high.toFixed(2)}`}
          </span>
        )}
        {info.fifty_two_week_high != null && info.fifty_two_week_low != null && (
          <span className="px-2.5 py-1 rounded-md bg-surface-tertiary text-txt-tertiary">
            {`52W: $${info.fifty_two_week_low.toFixed(2)} \u2013 $${info.fifty_two_week_high.toFixed(2)}`}
          </span>
        )}
      </div>
    </div>
  )
}
