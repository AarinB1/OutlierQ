import { useState } from 'react'
import { triggerScan } from '../api'
import type { ScanResult } from '../types'

export default function ScanButton() {
  const [input, setInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleScan = () => {
    const tickers = input.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    if (tickers.length === 0) return

    setScanning(true)
    setError(null)
    setResult(null)
    triggerScan(tickers)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setScanning(false))
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="AAPL, TSLA, NVDA..."
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleScan()}
        className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
      />
      <button
        onClick={handleScan}
        disabled={scanning || !input.trim()}
        className={`scan-button w-full py-2 rounded-lg font-mono font-bold text-xs tracking-wider transition-all duration-150 ${
          scanning
            ? 'bg-accent-blue/50 text-surface-primary animate-pulse'
            : 'bg-accent-blue text-surface-primary hover:shadow-[0_0_16px_rgba(68,138,255,0.3)]'
        } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
      >
        {scanning ? 'SCANNING...' : <><span className="scan-icon">⚡</span> SCAN NOW</>}
      </button>

      {result && (
        <div className="pt-1 space-y-1">
          <p className="text-txt-tertiary text-[11px] font-sans">
            {result.signals_generated} signal{result.signals_generated !== 1 ? 's' : ''} generated
          </p>
          {result.signals.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full ${s.direction === 'call' ? 'bg-accent-green' : 'bg-accent-red'}`} />
              <span className={`font-mono font-bold ${s.direction === 'call' ? 'text-accent-green' : 'text-accent-red'}`}>
                {s.direction.toUpperCase()}
              </span>
              <span className="font-mono text-txt-primary">{s.ticker}</span>
            </div>
          ))}
          {result.signals_generated === 0 && (
            <p className="text-txt-tertiary text-[10px] font-sans">
              {'\u25C7'} No outlier events detected. Markets quiet.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-accent-red text-[11px]">{error}</p>}
    </div>
  )
}
