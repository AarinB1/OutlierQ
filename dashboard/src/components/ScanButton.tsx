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
        placeholder="AAPL, TSLA..."
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleScan()}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-info focus:outline-none"
      />
      <button
        onClick={handleScan}
        disabled={scanning || !input.trim()}
        className="w-full py-1.5 rounded bg-info text-white text-xs font-medium hover:bg-blue-600 disabled:opacity-40"
      >
        {scanning ? 'Scanning...' : 'Scan Now'}
      </button>

      {result && (
        <div className="text-xs text-gray-400 mt-1">
          {result.signals_generated} signal{result.signals_generated !== 1 ? 's' : ''} generated
          {result.signals.map((s, i) => (
            <div key={i} className="mt-0.5">
              <span className={s.direction === 'call' ? 'text-bullish' : 'text-bearish'}>
                {s.direction.toUpperCase()}
              </span>{' '}
              <span className="font-mono">{s.ticker}</span>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-xs text-bearish">{error}</div>}
    </div>
  )
}
