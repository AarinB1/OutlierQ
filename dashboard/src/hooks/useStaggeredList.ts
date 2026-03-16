import { useState, useEffect, useRef } from 'react'

/**
 * Hook for staggered list entrance animations.
 * Returns visibleItems (same as items) and getDelay(index) for animation-delay.
 */
export function useStaggeredList<T>(items: T[], delayMs = 50): {
  visibleItems: T[]
  getDelay: (index: number) => number
} {
  const [mounted, setMounted] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    rafRef.current = requestAnimationFrame(() => setMounted(true))
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const getDelay = (index: number): number => (mounted ? index * delayMs : 0)

  return { visibleItems: items, getDelay }
}
