import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchDemoStatus,
  fetchTradingSettings,
  toggleDemoStatus,
  updateTradingSettings,
} from '../api'
import type { TradingSettings } from '../types'

interface TradingSettingsContextValue {
  settings: TradingSettings | null
  settingsLoading: boolean
  demoMode: boolean
  demoLoading: boolean
  refreshSettings: () => Promise<void>
  saveSettings: (next: Partial<TradingSettings>) => Promise<void>
  setDemoMode: (enabled: boolean) => Promise<void>
}

const TradingSettingsContext = createContext<TradingSettingsContextValue | null>(null)

export function TradingSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TradingSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [demoMode, setDemoModeState] = useState(false)
  const [demoLoading, setDemoLoading] = useState(true)

  const refreshSettings = async () => {
    setSettingsLoading(true)
    try {
      const next = await fetchTradingSettings()
      setSettings(next)
    } finally {
      setSettingsLoading(false)
    }
  }

  const refreshDemo = async () => {
    setDemoLoading(true)
    try {
      const next = await fetchDemoStatus()
      setDemoModeState(next.demo_mode)
    } finally {
      setDemoLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([refreshSettings(), refreshDemo()])
  }, [])

  const saveSettings = async (next: Partial<TradingSettings>) => {
    await updateTradingSettings(next)
    setSettings((prev) => (prev ? { ...prev, ...next } : ({ ...next } as TradingSettings)))
  }

  const setDemoMode = async (enabled: boolean) => {
    const next = await toggleDemoStatus(enabled)
    setDemoModeState(next.demo_mode)
  }

  const value = useMemo(
    () => ({
      settings,
      settingsLoading,
      demoMode,
      demoLoading,
      refreshSettings,
      saveSettings,
      setDemoMode,
    }),
    [settings, settingsLoading, demoMode, demoLoading],
  )

  return <TradingSettingsContext.Provider value={value}>{children}</TradingSettingsContext.Provider>
}

export function useTradingSettings() {
  const context = useContext(TradingSettingsContext)
  if (!context) {
    throw new Error('useTradingSettings must be used within TradingSettingsProvider')
  }
  return context
}
