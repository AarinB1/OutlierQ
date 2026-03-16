import { useState, useEffect, useCallback, useRef } from 'react'

export function useStaggeredList<T>(items: T[], delayMs = 50) {
  const [ready, setReady] = useState(false)
  const prevLength = useRef(0)

  useEffect(() => {
    if (items.length === 0) {
      setReady(false)
      prevLength.current = 0
      return
    }

    const raf = requestAnimationFrame(() => {
      setReady(true)
      prevLength.current = items.length
    })
    return () => cancelAnimationFrame(raf)
  }, [items])

  const getDelay = useCallback(
    (index: number) => ({
      animationDelay: `${index * delayMs}ms`,
      animationFillMode: 'both' as const,
    }),
    [delayMs],
  )

  return { visibleItems: items, ready, getDelay }
}
