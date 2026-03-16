import { useEffect, useMemo, useState } from 'react'

export function useStaggeredList<T>(items: T[], delayMs = 50) {
  const [visibleItems, setVisibleItems] = useState<T[]>([])

  useEffect(() => {
    let frame = 0
    setVisibleItems([])
    frame = requestAnimationFrame(() => {
      setVisibleItems(items)
    })

    return () => cancelAnimationFrame(frame)
  }, [items])

  const getDelay = useMemo(
    () => (index: number) => ({ animationDelay: `${index * delayMs}ms` }),
    [delayMs]
  )

  return { visibleItems, getDelay }
}
