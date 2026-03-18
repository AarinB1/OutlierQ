import { useEffect, useRef, useState, useCallback } from 'react'

interface SignalStreamMessage {
  type: 'new_signal' | 'regime_change' | 'alert' | 'pong'
  data?: Record<string, unknown>
}

interface UseSignalStreamOptions {
  onSignal?: (data: Record<string, unknown>) => void
  onRegimeChange?: (data: Record<string, unknown>) => void
  onAlert?: (data: Record<string, unknown>) => void
  autoReconnect?: boolean
  reconnectInterval?: number
}

export function useSignalStream(options: UseSignalStreamOptions = {}) {
  const {
    onSignal,
    onRegimeChange,
    onAlert,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options

  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<SignalStreamMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/signals`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: SignalStreamMessage = JSON.parse(event.data)
        setLastMessage(msg)

        if (msg.type === 'new_signal' && msg.data && onSignal) {
          onSignal(msg.data)
        } else if (msg.type === 'regime_change' && msg.data && onRegimeChange) {
          onRegimeChange(msg.data)
        } else if (msg.type === 'alert' && msg.data && onAlert) {
          onAlert(msg.data)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      if (autoReconnect) {
        reconnectTimer.current = setTimeout(connect, reconnectInterval)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [onSignal, onRegimeChange, onAlert, autoReconnect, reconnectInterval])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send('ping')
    }
  }, [])

  return { connected, lastMessage, sendPing }
}
