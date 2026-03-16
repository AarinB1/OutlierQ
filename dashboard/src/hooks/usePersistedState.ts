import { useState, useEffect, useCallback } from 'react'

/**
 * useState that persists to localStorage.
 * Returns [value, setValue] matching useState API.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored == null) return defaultValue
      return JSON.parse(stored) as T
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ignore quota/parse errors
    }
  }, [key, value])

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValueState(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      return resolved
    })
  }, [])

  return [value, setValue]
}
