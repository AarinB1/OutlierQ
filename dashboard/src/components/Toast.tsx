import { useState, useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { ToastContext, useToastManager, type Toast as ToastType } from '../hooks/useToast'

const ICONS: Record<string, string> = {
  signal: '\u26A1',
  event: '\u25C9',
  error: '\u2717',
  info: '\u24D8',
}

const BORDER_COLORS: Record<string, string> = {
  signal: 'border-l-accent-green',
  event: 'border-l-accent-blue',
  error: 'border-l-accent-red',
  info: 'border-l-accent-amber',
}

function ToastItem({ toast, onDismiss }: { toast: ToastType; onDismiss: () => void }) {
  return (
    <div
      className={`bg-surface-secondary border border-border rounded-card px-4 py-3 border-l-[3px] ${BORDER_COLORS[toast.type]} shadow-lg flex items-start gap-3 animate-toast-in min-w-[280px] max-w-sm`}
      role="alert"
    >
      <span className="text-base mt-0.5 shrink-0">{ICONS[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-sans font-medium text-txt-primary truncate">{toast.title}</p>
        {toast.subtitle && (
          <p className="text-xs font-mono text-txt-secondary mt-0.5 truncate">{toast.subtitle}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-txt-tertiary hover:text-txt-primary text-sm shrink-0 ml-2 transition-colors"
        aria-label="Dismiss notification"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

function ToastContainer() {
  return null
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const manager = useToastManager()

  const toasts = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
  )

  const [, forceUpdate] = useState(0)
  const rerender = useCallback(() => forceUpdate(x => x + 1), [])

  useSyncExternalStore(
    manager.subscribe,
    () => {
      rerender()
      return manager.getSnapshot()
    },
  )

  return (
    <ToastContext.Provider value={{ toasts, addToast: manager.addToast, removeToast: manager.removeToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={() => manager.removeToast(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export default ToastContainer
