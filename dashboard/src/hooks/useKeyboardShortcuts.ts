import { useEffect } from 'react'
import type { OptionsPage } from '../App'

interface UseKeyboardShortcutsOptions {
  onNavigate: (page: OptionsPage) => void
  onFocusSearch: () => void
  onToggleShortcuts: () => void
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable
}

export function useKeyboardShortcuts({
  onNavigate,
  onFocusSearch,
  onToggleShortcuts,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === '/') {
        event.preventDefault()
        onFocusSearch()
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        onToggleShortcuts()
        return
      }

      const pageMap: Record<string, OptionsPage> = {
        s: 'signals',
        e: 'events',
        a: 'accuracy',
        t: 'tickers',
        d: 'discovery',
      }

      const nextPage = pageMap[key]
      if (nextPage) {
        event.preventDefault()
        onNavigate(nextPage)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onFocusSearch, onNavigate, onToggleShortcuts])
}
