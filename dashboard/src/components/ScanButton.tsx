import { useState } from 'react'
import { triggerScan } from '../api'
import type { ScanResult } from '../types'
import Icon from './Icon'
import { DEMO_MODE } from '../demo/demoConfig'

export default function ScanButton() {
  // Prefilled in the demo: an empty field left the sidebar's main action
  // disabled on arrival, which read as broken rather than as "type first".
  const [input, setInput] = useState(DEMO_MODE ? 'NVDA, AAPL' : '')
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
        aria-label="Tickers to scan, comma separated"
        placeholder="AAPL, TSLA, NVDA..."
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleScan()}
        className="w-full bg-surface-secondary border border-border rounded-md px-3 py-2 text-xs font-mono text-txt-primary placeholder-txt-tertiary focus:border-accent-blue focus:outline-none transition-colors duration-150"
      />
      <button
        onClick={handleScan}
        disabled={scanning || !input.trim()}
        className={`scan-button inline-flex w-full items-center justify-center gap-2 rounded-md border border-accent-ice py-2 font-sans text-[13px] font-semibold transition-colors duration-150 ${
          scanning
            ? 'bg-accent-ice/60 text-surface-primary animate-pulse'
            : 'bg-accent-ice text-surface-primary hover:bg-[#d3e0ff]'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {scanning ? 'Scanning…' : <><Icon name="zap" className="scan-icon h-3.5 w-3.5" /> Scan now</>}
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
            <p className="text-txt-tertiary text-[11px] font-sans">
              No outlier events detected. An empty scan is a correct result.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-accent-red text-[11px]">{error}</p>}
    </div>
  )
}
