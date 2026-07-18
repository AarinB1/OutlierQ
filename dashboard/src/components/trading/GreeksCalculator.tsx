import { useState } from 'react'
import { computeGreeks } from '../../api'
import { useToast } from '../../hooks/useToast'

interface GreeksResult {
  price: number
  delta: number
  gamma: number
  theta: number
  vega: number
}

export default function GreeksCalculator() {
  const { addToast } = useToast()
  const [spotPrice, setSpotPrice] = useState(100)
  const [strikePrice, setStrikePrice] = useState(100)
  const [timeToExpiry, setTimeToExpiry] = useState(0.25) // 3 months
  const [volatility, setVolatility] = useState(0.2)
  const [riskFreeRate, setRiskFreeRate] = useState(0.05)
  const [optionType, setOptionType] = useState<'call' | 'put'>('call')
  const [result, setResult] = useState<GreeksResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCompute = async () => {
    setLoading(true)
    try {
      const data = await computeGreeks({
        spot_price: spotPrice,
        strike_price: strikePrice,
        time_to_expiry: timeToExpiry,
        volatility,
        risk_free_rate: riskFreeRate,
        option_type: optionType,
      })
      setResult(data as unknown as GreeksResult)
    } catch (e: unknown) {
      addToast('error', e instanceof Error ? e.message : 'Computation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-mono font-bold text-lg text-txt-primary tracking-tight">Greeks Calculator</h2>

      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="label text-xs block mb-1">Spot Price ($)</label>
            <input
              type="number"
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={spotPrice}
              onChange={e => setSpotPrice(Number(e.target.value))}
              step={1}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Strike Price ($)</label>
            <input
              type="number"
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={strikePrice}
              onChange={e => setStrikePrice(Number(e.target.value))}
              step={1}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Time to Expiry (years)</label>
            <input
              type="number"
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={timeToExpiry}
              onChange={e => setTimeToExpiry(Number(e.target.value))}
              step={0.01}
              min={0.01}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Implied Volatility</label>
            <input
              type="number"
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={volatility}
              onChange={e => setVolatility(Number(e.target.value))}
              step={0.01}
              min={0.01}
              max={3}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Risk-Free Rate</label>
            <input
              type="number"
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={riskFreeRate}
              onChange={e => setRiskFreeRate(Number(e.target.value))}
              step={0.005}
            />
          </div>
          <div>
            <label className="label text-xs block mb-1">Option Type</label>
            <select
              className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={optionType}
              onChange={e => setOptionType(e.target.value as 'call' | 'put')}
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>
        </div>
        <button
          className="btn-primary px-4 py-1.5 text-sm mt-4"
          onClick={handleCompute}
          disabled={loading}
        >
          {loading ? 'Computing...' : 'Compute Greeks'}
        </button>
      </div>

      {result && (
        <div className="card p-4">
          <h3 className="label mb-4">Black-Scholes Results</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-6">
            <div className="text-center">
              <p className="text-xs text-txt-secondary mb-1">Price</p>
              <p className="text-2xl font-semibold text-accent-blue">${result.price.toFixed(4)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-txt-secondary mb-1">Delta</p>
              <p className={`text-2xl font-semibold ${result.delta >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {result.delta.toFixed(4)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-txt-secondary mb-1">Gamma</p>
              <p className="text-2xl font-semibold">{result.gamma.toFixed(4)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-txt-secondary mb-1">Theta</p>
              <p className="text-2xl font-semibold text-accent-red">{result.theta.toFixed(4)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-txt-secondary mb-1">Vega</p>
              <p className="text-2xl font-semibold">{result.vega.toFixed(4)}</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-bg-secondary rounded-lg text-xs text-txt-secondary">
            <p><strong>Delta</strong>: Rate of change of option price per $1 move in underlying</p>
            <p><strong>Gamma</strong>: Rate of change of delta per $1 move in underlying</p>
            <p><strong>Theta</strong>: Daily time decay (negative = losing value per day)</p>
            <p><strong>Vega</strong>: Sensitivity to 1% change in implied volatility</p>
          </div>
        </div>
      )}
    </div>
  )
}
