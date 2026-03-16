import { useMemo } from 'react'

interface SparklineProps {
  data: number[]
  width?: number | string
  height?: number
  color?: string
}

function normalizePoints(data: number[], width: number, height: number) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = Math.max(max - min, 1e-6)
  const innerHeight = height - 2
  const step = data.length > 1 ? width / (data.length - 1) : width

  return data.map((value, index) => {
    const x = index * step
    const y = innerHeight - ((value - min) / range) * innerHeight + 1
    return { x, y }
  })
}

function pathLength(points: { x: number; y: number }[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

export default function Sparkline({
  data,
  width = '100%',
  height = 32,
  color = '#00d68f',
}: SparklineProps) {
  const svgWidth = 100

  const { points, line, area, id, length } = useMemo(() => {
    if (data.length < 2) {
      return { points: [], line: '', area: '', id: '', length: 0 }
    }

    const pts = normalizePoints(data, svgWidth, height)
    const linePath = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const areaPath = `${linePath} L ${svgWidth},${height} L 0,${height} Z`
    const gradientId = `sparkline-${Math.random().toString(36).slice(2, 8)}`
    return {
      points: pts,
      line: linePath,
      area: areaPath,
      id: gradientId,
      length: pathLength(pts),
    }
  }, [data, height])

  if (points.length < 2) return null

  return (
    <svg width={width} height={height} viewBox={`0 0 ${svgWidth} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        className="sparkline-path"
        style={{ ['--sparkline-length' as string]: String(length) }}
      />
    </svg>
  )
}
