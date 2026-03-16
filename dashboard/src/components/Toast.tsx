import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastType = 'signal' | 'event' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  subtitle?: string
}

const MAX_TOASTS = 3

const TOAST_CONFIG: Record<ToastType, { icon: string; borderClass: string }> = {
  signal: { icon: '\u26A1', borderClass: 'border-l-accent-green' },
  event: { icon: '\u25C9', borderClass: 'border-l-accent-blue' },
  error: { icon: '\u2717', borderClass: 'border-l-accent-red' },
  info: { icon: '\u2139', borderClass: 'border-l-accent-amber' },
}

interface ToastContextValue {
  addToast: (type: ToastType, title: string, subtitle?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((type: ToastType, title: string, subtitle?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item: ToastItem = { id, type, title, subtitle }
    setToasts(prev => {
      const next = [...prev, item]
      if (next.length > MAX_TOASTS) return next.slice(-MAX_TOASTS)
      return next
    })
    setTimeout(() => {
      setToasts(p => p.filter(t => t.id !== id))
    }, 5000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(p => p.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map(t => {
          const cfg = TOAST_CONFIG[t.type]
          return (
            <div
              key={t.id}
              className={`bg-surface-secondary border border-border rounded-card p-4 border-l-4 ${cfg.borderClass} shadow-lg
                animate-[slideInRight_200ms_ease-out] flex items-start gap-3`}
              style={{
                animation: 'slideInRight 200ms ease-out',
              }}
            >
              <span className="text-lg shrink-0" aria-hidden>{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-sm text-txt-primary truncate">{t.title}</p>
                {t.subtitle && (
                  <p className="text-txt-secondary text-xs font-sans mt-0.5 truncate">{t.subtitle}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-txt-tertiary hover:text-txt-primary transition-colors p-1 rounded"
                aria-label="Dismiss"
              >
                {'\u2715'}
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}
