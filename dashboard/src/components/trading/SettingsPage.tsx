import { useState, useEffect } from 'react'
import { fetchSettings, updateSettings } from '../../api'
import type { UserSettingsData } from '../../types'
import { useToast } from '../../hooks/useToast'

export default function SettingsPage() {
  const { addToast } = useToast()
  const [settings, setSettings] = useState<UserSettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(() => addToast('error', 'Load failed', 'Could not load settings'))
      .finally(() => setLoading(false))
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const update = <K extends keyof UserSettingsData>(key: K, value: UserSettingsData[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev)
  }

  const handleSave = async () => {
    if (!settings) return
    try {
      await updateSettings(settings as unknown as Record<string, unknown>)
      addToast('info', 'Settings saved', 'Your preferences have been updated')
    } catch {
      addToast('error', 'Save failed', 'Could not save settings')
    }
  }

  const requestNotifPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission()
      setNotifPermission(perm)
    }
  }

  const sendTestNotification = () => {
    if (Notification.permission === 'granted') {
      new Notification('OutlierQ Test', { body: 'Browser notifications are working!' })
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        <h2 className="font-mono font-bold text-lg">Settings</h2>
        <div className="card"><div className="skeleton h-48 w-full" /></div>
      </div>
    )
  }

  const disabled = !settings.notifications_enabled

  return (
    <div className="space-y-4">
      <h2 className="font-mono font-bold text-lg">Settings</h2>

      {/* Notifications */}
      <div className="card space-y-3">
        <h3 className="font-mono font-bold text-sm">Notifications</h3>
        <ToggleRow label="Enable notifications" checked={settings.notifications_enabled} onChange={v => update('notifications_enabled', v)} />
        <ToggleRow label="Notify on new signal" checked={settings.notify_on_signal} onChange={v => update('notify_on_signal', v)} disabled={disabled} />
        <ToggleRow label="Notify on backtest complete" checked={settings.notify_on_backtest_complete} onChange={v => update('notify_on_backtest_complete', v)} disabled={disabled} />
        <ToggleRow label="Notify on drawdown breach" checked={settings.notify_on_drawdown_breach} onChange={v => update('notify_on_drawdown_breach', v)} disabled={disabled} />
        <ToggleRow label="Only notify for watched tickers" checked={settings.watched_tickers_only} onChange={v => update('watched_tickers_only', v)} disabled={disabled} />
      </div>

      {/* Thresholds */}
      <div className="card space-y-3">
        <h3 className="font-mono font-bold text-sm">Thresholds</h3>
        <div className="flex items-center gap-4">
          <span className="label w-48 text-xs">Min Signal Confidence</span>
          <input type="range" min={0.3} max={0.9} step={0.05} value={settings.min_signal_confidence} onChange={e => update('min_signal_confidence', parseFloat(e.target.value))} className="flex-1 accent-accent-blue" />
          <span className="font-mono text-sm w-12 text-right">{settings.min_signal_confidence.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="label w-48 text-xs">Drawdown Alert Threshold (%)</span>
          <input type="range" min={1} max={20} step={0.5} value={settings.drawdown_alert_threshold} onChange={e => update('drawdown_alert_threshold', parseFloat(e.target.value))} className="flex-1 accent-accent-blue" />
          <span className="font-mono text-sm w-12 text-right">{settings.drawdown_alert_threshold.toFixed(1)}%</span>
        </div>
      </div>

      {/* Browser Push */}
      <div className="card space-y-3">
        <h3 className="font-mono font-bold text-sm">Browser Push Notifications</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-txt-secondary">Status:</span>
          <span className={`pill text-xs ${notifPermission === 'granted' ? 'bg-accent-green-muted text-accent-green' : notifPermission === 'denied' ? 'bg-accent-red-muted text-accent-red' : 'bg-accent-amber-muted text-accent-amber'}`}>
            {notifPermission === 'granted' ? 'Granted' : notifPermission === 'denied' ? 'Denied' : 'Not set'}
          </span>
        </div>
        <div className="flex gap-2">
          {notifPermission !== 'granted' && (
            <button className="btn-primary text-xs px-4 py-2" onClick={requestNotifPermission}>Enable Push Notifications</button>
          )}
          {notifPermission === 'granted' && (
            <button className="btn-primary text-xs px-4 py-2" onClick={sendTestNotification}>Send Test Notification</button>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="card space-y-3 opacity-60">
        <h3 className="font-mono font-bold text-sm">Email Notifications (Coming Soon)</h3>
        <input disabled value={settings.email || ''} placeholder="email@example.com" className="w-full bg-surface-tertiary border border-border rounded px-3 py-2 text-sm opacity-50" />
        <p className="text-xs text-txt-tertiary">Email alerts will be available in a future update.</p>
      </div>

      <button className="btn-primary px-6 py-2" onClick={handleSave}>Save Settings</button>
    </div>
  )
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex justify-between items-center py-1 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <span className="text-sm text-txt-secondary">{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-accent-blue w-4 h-4" />
    </label>
  )
}
