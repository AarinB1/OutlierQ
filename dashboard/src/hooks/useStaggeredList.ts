import { useEffect, useMemo, useState, useCallback } from 'react'

interface StaggeredResult<T> {
  visibleItems: T[]
  getDelay: (index: number) => string
  ready: boolean
}

export function useStaggeredList<T>(items: T[], delayMs = 50): StaggeredResult<T> {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [items])

  const visibleItems = useMemo(() => items, [items])

  const getDelay = useCallback((index: number) => `${index * delayMs}ms`, [delayMs])

  return {
    visibleItems,
    getDelay,
    ready,
  }
}
