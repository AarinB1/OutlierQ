import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { key: 's', description: 'Go to Signals' },
  { key: 'e', description: 'Go to Events' },
  { key: 'a', description: 'Go to Accuracy' },
  { key: 't', description: 'Go to Tickers' },
  { key: 'd', description: 'Go to Discovery' },
  { key: '/', description: 'Focus ticker search' },
  { key: '?', description: 'Toggle this dialog' },
]

export default function ShortcutsModal({ open, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstFocusableRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    firstFocusableRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="bg-surface-secondary border border-border rounded-card p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono font-bold text-lg text-txt-primary">Keyboard Shortcuts</h2>
          <button
            ref={firstFocusableRef}
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors text-lg"
            aria-label="Close shortcuts dialog"
          >
            {'\u00D7'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-surface-tertiary border border-border text-txt-primary font-mono text-sm font-bold">
                {s.key}
              </kbd>
              <span className="text-txt-secondary text-sm font-sans">{s.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
