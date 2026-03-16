import { useEffect } from 'react'
import type { Page } from '../App'

interface KeyboardShortcutsOptions {
  enabled: boolean
  onNavigate: (page: Page) => void
  onToggleShortcuts: () => void
}

function isInputFocused(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    (active as HTMLElement).isContentEditable
  )
}

function focusTickerSearch() {
  const node = document.querySelector<HTMLInputElement>('[data-ticker-search="true"]')
  node?.focus()
  node?.select()
}

export function useKeyboardShortcuts({
  enabled,
  onNavigate,
  onToggleShortcuts,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isQuestion = event.key === '?' || (event.shiftKey && event.key === '/')
      if (isInputFocused()) return

      if (event.key === '/') {
        event.preventDefault()
        focusTickerSearch()
        return
      }

      if (isQuestion) {
        event.preventDefault()
        onToggleShortcuts()
        return
      }

      if (key === 's') onNavigate('signals')
      if (key === 'e') onNavigate('events')
      if (key === 'a') onNavigate('accuracy')
      if (key === 't') onNavigate('tickers')
      if (key === 'd') onNavigate('discovery')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onNavigate, onToggleShortcuts])
}
