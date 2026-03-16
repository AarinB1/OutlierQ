import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { key: 'S', description: 'Go to Signals' },
  { key: 'E', description: 'Go to Events' },
  { key: 'A', description: 'Go to Accuracy' },
  { key: 'T', description: 'Go to Tickers' },
  { key: 'D', description: 'Go to Discovery' },
  { key: '/', description: 'Focus ticker search' },
  { key: '?', description: 'Toggle this shortcuts modal' },
  { key: 'Esc', description: 'Close modal' },
]

export default function ShortcutsModal({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    focusable?.[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="card w-full max-w-xl py-5 px-6"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono font-bold text-base text-txt-primary">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={`${shortcut.key}-${shortcut.description}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-tertiary px-3 py-2"
            >
              <kbd className="font-mono text-xs text-txt-primary border border-border rounded px-2 py-1 bg-surface-primary">
                {shortcut.key}
              </kbd>
              <span className="text-xs text-txt-secondary">{shortcut.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
