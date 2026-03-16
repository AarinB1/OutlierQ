import { useMemo, useId } from 'react'

interface Props {
  data: number[]
  width?: string | number
  height?: number
  color?: string
}

export default function Sparkline({ data, width = '100%', height = 32, color = '#00d68f' }: Props) {
  const gradientId = useId()

  const { points, fillPoints } = useMemo(() => {
    if (data.length < 2) return { points: '', fillPoints: '' }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const padding = 1

    const pts = data.map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (100 - padding * 2)
      const y = padding + (1 - (v - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })

    const polyline = pts.join(' ')
    const fillPoly = `${pts[0].split(',')[0]},${height} ${polyline} ${pts[pts.length - 1].split(',')[0]},${height}`

    return { points: polyline, fillPoints: fillPoly }
  }, [data, height])

  if (data.length < 2) return null

  const totalLength = data.length * 20

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="sparkline-draw"
      style={{ '--sparkline-length': totalLength } as React.CSSProperties}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: totalLength,
          strokeDashoffset: totalLength,
          animation: 'sparklineDraw 300ms ease-out forwards',
        }}
      />
    </svg>
  )
}
