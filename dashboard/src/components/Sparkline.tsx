import { useEffect, useId, useMemo, useRef, useState } from 'react'

interface Props {
  data: number[]
  width?: number | string
  height?: number
  color?: string
}

export default function Sparkline({
  data,
  width = '100%',
  height = 32,
  color = 'var(--sparkline-color, #00d68f)',
}: Props) {
  const pathRef = useRef<SVGPathElement | null>(null)
  const gradientId = useId()
  const [pathLength, setPathLength] = useState(100)

  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) {
      return { linePath: '', areaPath: '' }
    }

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return { x, y }
    })

    const line = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ')
    const area = `${line} L 100 100 L 0 100 Z`

    return { linePath: line, areaPath: area }
  }, [data])

  useEffect(() => {
    if (!pathRef.current) {
      return
    }

    setPathLength(pathRef.current.getTotalLength())
  }, [linePath])

  if (data.length < 2) {
    return null
  }

  return (
    <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="sparkline-path"
        style={{
          strokeDasharray: pathLength,
          strokeDashoffset: pathLength,
          ['--path-length' as string]: pathLength,
        }}
      />
    </svg>
  )
}
