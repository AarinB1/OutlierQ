import { useEffect, useRef } from 'react'

const SHORTCUTS = [
  { keyLabel: 'S', description: 'Go to Signals' },
  { keyLabel: 'E', description: 'Go to Events' },
  { keyLabel: 'A', description: 'Go to Accuracy' },
  { keyLabel: 'T', description: 'Go to Tickers' },
  { keyLabel: 'D', description: 'Go to Discovery' },
  { keyLabel: '/', description: 'Focus ticker search' },
  { keyLabel: '?', description: 'Toggle shortcuts help' },
  { keyLabel: 'Esc', description: 'Close this dialog' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function ShortcutsModal({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const panel = panelRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable?.[0]
    const last = focusable?.[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab' && first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-primary/80 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-2xl rounded-card border border-border bg-surface-secondary p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 id="shortcuts-title" className="font-mono text-lg font-bold text-txt-primary">
              Keyboard Shortcuts
            </h2>
            <p className="mt-1 text-sm text-txt-secondary">Quick navigation for the options workspace.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-txt-tertiary transition-colors hover:text-txt-primary"
          >
            Close
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keyLabel}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-tertiary px-4 py-3"
            >
              <span className="text-sm text-txt-secondary">{shortcut.description}</span>
              <kbd className="rounded-md border border-border bg-surface-primary px-2 py-1 font-mono text-xs text-txt-primary">
                {shortcut.keyLabel}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
