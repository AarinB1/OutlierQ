import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface StaggeredResult<T> {
  visibleItems: T[]
  getDelay: (index: number) => string
  ready: boolean
}

export function useStaggeredList<T>(items: T[], delayMs = 50): StaggeredResult<T> {
  const [ready, setReady] = useState(false)
  const countRef = useRef(items.length)

  useEffect(() => {
    // Only reset animation when item COUNT changes, not on every re-render
    if (items.length === countRef.current && ready) return
    countRef.current = items.length
    setReady(false)
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [items.length, ready])

  const visibleItems = useMemo(() => items, [items])

  const getDelay = useCallback((index: number) => `${index * delayMs}ms`, [delayMs])

  return {
    visibleItems,
    getDelay,
    ready,
  }
}
