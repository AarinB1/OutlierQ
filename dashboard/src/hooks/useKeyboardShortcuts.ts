import { useEffect, useCallback } from 'react'
import type { OptionsPage, Section } from '../App'

interface ShortcutHandlers {
  section: Section
  setSection: (s: Section) => void
  setPage: (p: OptionsPage) => void
  focusTickerSearch: () => void
  toggleShortcutsModal: () => void
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role')
  const htmlEl = el as HTMLElement
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    role === 'textbox' ||
    (typeof htmlEl.isContentEditable === 'boolean' && htmlEl.isContentEditable)
  )
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const { section, setSection, setPage, focusTickerSearch, toggleShortcutsModal } = handlers

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInputFocused()) return

      switch (e.key.toLowerCase()) {
        case 's':
          setSection('options')
          setPage('signals')
          break
        case 'e':
          setSection('options')
          setPage('events')
          break
        case 'a':
          setSection('options')
          setPage('accuracy')
          break
        case 't':
          setSection('options')
          setPage('tickers')
          break
        case 'd':
          setSection('options')
          setPage('discovery')
          break
        case '/':
          e.preventDefault()
          focusTickerSearch()
          break
        case '?':
          e.preventDefault()
          toggleShortcutsModal()
          break
        default:
          break
      }
    },
    [section, setSection, setPage, focusTickerSearch, toggleShortcutsModal]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
