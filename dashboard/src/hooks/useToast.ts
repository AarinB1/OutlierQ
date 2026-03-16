import { createContext, useContext, useCallback, useRef } from 'react'

export type ToastType = 'signal' | 'event' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  subtitle?: string
}

export interface ToastContextValue {
  toasts: Toast[]
  addToast: (type: ToastType, title: string, subtitle?: string) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

let toastCounter = 0

export function useToastManager() {
  const toastsRef = useRef<Toast[]>([])
  const listenersRef = useRef<Set<() => void>>(new Set())

  const notify = useCallback(() => {
    listenersRef.current.forEach(fn => fn())
  }, [])

  const removeToast = useCallback((id: string) => {
    toastsRef.current = toastsRef.current.filter(t => t.id !== id)
    notify()
  }, [notify])

  const addToast = useCallback((type: ToastType, title: string, subtitle?: string) => {
    const id = `toast-${++toastCounter}`
    const toast: Toast = { id, type, title, subtitle }

    if (toastsRef.current.length >= 3) {
      toastsRef.current = toastsRef.current.slice(1)
    }
    toastsRef.current = [...toastsRef.current, toast]
    notify()

    setTimeout(() => removeToast(id), 5000)
  }, [notify, removeToast])

  const subscribe = useCallback((fn: () => void) => {
    listenersRef.current.add(fn)
    return () => { listenersRef.current.delete(fn) }
  }, [])

  const getSnapshot = useCallback(() => toastsRef.current, [])

  return { addToast, removeToast, subscribe, getSnapshot }
}
