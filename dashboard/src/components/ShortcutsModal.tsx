import { useEffect, useRef } from 'react'

interface Props {
  onClose: () => void
}

const SHORTCUTS: { key: string; description: string }[] = [
  { key: 'S', description: 'Signals page' },
  { key: 'E', description: 'Events page' },
  { key: 'A', description: 'Accuracy page' },
  { key: 'T', description: 'Tickers page' },
  { key: 'D', description: 'Discovery page' },
  { key: '/', description: 'Focus ticker search' },
  { key: '?', description: 'Show this shortcuts overlay' },
  { key: 'Esc', description: 'Close overlay' },
]

export default function ShortcutsModal({ onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    overlayRef.current?.focus()
    return () => prev?.focus()
  }, [])

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-surface-secondary border border-border rounded-card p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="shortcuts-title" className="font-mono font-bold text-lg text-txt-primary mb-4">
          Keyboard Shortcuts
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {SHORTCUTS.map(({ key, description }) => (
            <div
              key={key}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-tertiary"
            >
              <span className="text-txt-secondary text-sm font-sans">{description}</span>
              <kbd className="px-2 py-1 rounded bg-surface-primary border border-border text-xs font-mono text-txt-primary">
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-txt-tertiary text-xs mt-4 font-sans">
          Press Escape or click outside to close.
        </p>
      </div>
    </div>
  )
}
