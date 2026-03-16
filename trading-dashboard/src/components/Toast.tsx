import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react'

export type ToastType = 'signal' | 'event' | 'error' | 'info' | 'trade'

export interface ToastMessage {
  id: string
  type: ToastType
  title: string
  subtitle?: string
}

interface ToastContextValue {
  addToast: (type: ToastType, title: string, subtitle?: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

interface ProviderProps {
  children: ReactNode
}

const TOAST_META: Record<
  ToastType,
  { icon: string; border: string; iconClass: string }
> = {
  signal: { icon: '⚡', border: 'border-l-accent-green', iconClass: 'text-accent-green' },
  event: { icon: '◉', border: 'border-l-accent-blue', iconClass: 'text-accent-blue' },
  error: { icon: '⨯', border: 'border-l-accent-red', iconClass: 'text-accent-red' },
  info: { icon: 'i', border: 'border-l-accent-amber', iconClass: 'text-accent-amber' },
  trade: { icon: '📊', border: 'border-l-accent-blue', iconClass: 'text-accent-blue' },
}

export function ToastProvider({ children }: ProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback((type: ToastType, title: string, subtitle?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => {
      const next = [...prev, { id, type, title, subtitle }]
      return next.slice(-3)
    })

    window.setTimeout(() => dismissToast(id), 5000)
  }, [dismissToast])

  const value = useMemo(() => ({ addToast }), [addToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex w-[min(26rem,90vw)] flex-col gap-3">
        {toasts.map((toast) => {
          const meta = TOAST_META[toast.type]
          return (
            <div
              key={toast.id}
              className={`toast-enter card border-l-[3px] py-3 px-4 ${meta.border}`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 text-sm ${meta.iconClass}`} aria-hidden="true">
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-sans font-semibold text-txt-primary">{toast.title}</p>
                  {toast.subtitle && (
                    <p className="text-xs text-txt-secondary mt-0.5 truncate">{toast.subtitle}</p>
                  )}
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors"
                  aria-label="Dismiss toast"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

