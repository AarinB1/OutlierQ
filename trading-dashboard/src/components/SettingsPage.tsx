import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../hooks/useToast'
import { useTradingSettings } from '../context/TradingSettingsContext'
import type { TradingSettings } from '../types'

export default function SettingsPage() {
  const { addToast } = useToast()
  const { settings, settingsLoading, saveSettings } = useTradingSettings()
  const [draft, setDraft] = useState<TradingSettings | null>(null)
  const [permission, setPermission] = useState<string>('default')

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }
  }, [])

  const masterDisabled = !draft?.notifications_enabled

  const permissionMeta = useMemo(() => {
    if (permission === 'granted') return { label: 'Granted', className: 'text-accent-green' }
    if (permission === 'denied') return { label: 'Denied', className: 'text-accent-red' }
    return { label: 'Not set', className: 'text-accent-amber' }
  }, [permission])

  if (settingsLoading || !draft) {
    return (
      <div className="space-y-4">
        <h2 className="font-mono font-bold text-lg">Settings</h2>
        <div className="card space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="skeleton h-10 w-full rounded" />
          ))}
        </div>
      </div>
    )
  }

  const update = <K extends keyof TradingSettings>(key: K, value: TradingSettings[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  const sendTest = () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification('OutlierQ test notification', {
      body: 'Trading alerts are enabled in your browser.',
      icon: '/favicon.ico',
    })
  }

  const handleSave = async () => {
    try {
      await saveSettings(draft)
      addToast('info', 'Settings saved', 'Trading notification preferences updated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings'
      addToast('error', 'Save failed', message)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-mono font-bold text-lg">Settings</h2>

      <div className="card space-y-3">
        <h3 className="font-mono font-semibold text-sm">Notifications</h3>
        <ToggleRow
          label="Enable notifications"
          checked={draft.notifications_enabled}
          onChange={(value) => update('notifications_enabled', value)}
        />
        <ToggleRow
          label="Notify on new signal"
          checked={draft.notify_on_signal}
          disabled={masterDisabled}
          onChange={(value) => update('notify_on_signal', value)}
        />
        <ToggleRow
          label="Notify on backtest complete"
          checked={draft.notify_on_backtest_complete}
          disabled={masterDisabled}
          onChange={(value) => update('notify_on_backtest_complete', value)}
        />
        <ToggleRow
          label="Notify on drawdown breach"
          checked={draft.notify_on_drawdown_breach}
          disabled={masterDisabled}
          onChange={(value) => update('notify_on_drawdown_breach', value)}
        />
        <ToggleRow
          label="Only notify for watched tickers"
          checked={draft.watched_tickers_only}
          disabled={masterDisabled}
          onChange={(value) => update('watched_tickers_only', value)}
        />
      </div>

      <div className="card space-y-4">
        <h3 className="font-mono font-semibold text-sm">Thresholds</h3>
        <SliderRow
          label="Min signal confidence"
          min={0.3}
          max={0.9}
          step={0.05}
          value={draft.min_signal_confidence}
          onChange={(value) => update('min_signal_confidence', value)}
        />
        <SliderRow
          label="Drawdown alert threshold"
          min={1}
          max={20}
          step={0.5}
          value={draft.drawdown_alert_threshold}
          onChange={(value) => update('drawdown_alert_threshold', value)}
          suffix="%"
        />
      </div>

      <div className="card space-y-3">
        <h3 className="font-mono font-semibold text-sm">Browser Push Notifications</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-txt-secondary">Status:</span>
          <span className={`pill text-xs ${permissionMeta.className}`}>
            {permissionMeta.label}
          </span>
        </div>
        <div className="flex gap-2">
          {permission !== 'granted' && (
            <button className="btn-primary text-xs px-4 py-2" onClick={requestPermission}>
              Enable Push Notifications
            </button>
          )}
          <button
            className="px-3 py-2 border border-border rounded text-xs text-txt-secondary disabled:opacity-50"
            onClick={sendTest}
            disabled={permission !== 'granted'}
          >
            Send Test Notification
          </button>
        </div>
      </div>

      <div className="card opacity-70 space-y-2">
        <h3 className="font-mono font-semibold text-sm">Email Notifications (Coming Soon)</h3>
        <input
          disabled
          value={draft.email ?? ''}
          placeholder="you@example.com"
          className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm opacity-50"
        />
        <p className="text-xs text-txt-tertiary">Email alerts will be available in a future update.</p>
      </div>

      <button className="btn-primary px-6 py-2" onClick={handleSave}>
        Save Settings
      </button>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-sm text-txt-secondary">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent-blue w-4 h-4"
      />
    </label>
  )
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix = '',
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <div className="grid grid-cols-[180px_1fr_72px] gap-4 items-center">
      <span className="text-sm text-txt-secondary">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent-blue"
      />
      <span className="font-mono text-sm text-right">
        {value}
        {suffix}
      </span>
    </div>
  )
}
