import { useState, useEffect, useCallback } from 'react'

export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) return defaultValue
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [key, state])

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState(value)
  }, [])

  return [state, setValue]
}
