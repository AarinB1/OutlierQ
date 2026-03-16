import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastType = 'signal' | 'event' | 'error' | 'info'

export interface ToastInput {
  type: ToastType
  title: string
  subtitle?: string
}

interface ToastRecord extends ToastInput {
  id: string
  exiting: boolean
}

interface ToastContextValue {
  addToast: (type: ToastType, title: string, subtitle?: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_META: Record<ToastType, { icon: string; border: string; iconColor: string }> = {
  signal: { icon: '⚡', border: 'border-l-accent-green', iconColor: 'text-accent-green' },
  event: { icon: '◉', border: 'border-l-accent-blue', iconColor: 'text-accent-blue' },
  error: { icon: '!', border: 'border-l-accent-red', iconColor: 'text-accent-red' },
  info: { icon: 'i', border: 'border-l-accent-amber', iconColor: 'text-accent-amber' },
}

const EXIT_MS = 180
const AUTO_DISMISS_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timeoutsRef = useRef<Map<string, number>>(new Map())

  const dismissToast = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast))
    )

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      timeoutsRef.current.delete(id)
    }, EXIT_MS)

    timeoutsRef.current.set(id, timeoutId)
  }, [])

  const addToast = useCallback(
    (type: ToastType, title: string, subtitle?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((current) => {
        const next = [...current, { id, type, title, subtitle, exiting: false }]
        if (next.length > 3) {
          return next.slice(next.length - 3)
        }
        return next
      })

      const timeoutId = window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS)
      timeoutsRef.current.set(id, timeoutId)
    },
    [dismissToast]
  )

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      timeoutsRef.current.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ addToast }), [addToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => {
          const meta = TOAST_META[toast.type]
          return (
            <div
              key={toast.id}
              className={`rounded-card border border-border border-l-4 bg-surface-secondary p-4 shadow-lg ${
                meta.border
              } ${toast.exiting ? 'toast-exit' : 'toast-enter'}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 text-sm ${meta.iconColor}`} aria-hidden="true">
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-txt-primary">{toast.title}</div>
                  {toast.subtitle ? (
                    <div className="mt-1 text-xs text-txt-secondary">{toast.subtitle}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-md px-1 text-txt-tertiary transition-colors hover:text-txt-primary"
                  aria-label="Dismiss toast"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
