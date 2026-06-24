'use client'

import { useEffect, useState } from 'react'
import { useApiFetch } from '@/lib/api'
import { Card, Spinner, ErrorBanner } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotificationPreference {
  id: string
  userId: string
  channel: string
  eventType: string
  enabled: boolean
}

const EVENT_TYPES = [
  { key: 'PUBLISH_SUCCESS', label: 'Publish Success' },
  { key: 'PUBLISH_FAILURE', label: 'Publish Failure' },
  { key: 'TREND_DIGEST', label: 'Trend Digest' },
  { key: 'APPROVAL_NEEDED', label: 'Approval Needed' },
  { key: 'COMMENT_MENTION', label: 'Comment / Mention' },
] as const

const CHANNELS = [
  { key: 'in_app', label: 'In-App' },
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'slack', label: 'Slack' },
] as const

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const apiFetch = useApiFetch()

  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    try {
      const r = await apiFetch('/notifications/preferences')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: NotificationPreference[] = await r.json()
      setPreferences(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load notification preferences.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleToggle(pref: NotificationPreference) {
    setSaving(pref.id)
    setPreferences((prev) =>
      prev.map((p) => (p.id === pref.id ? { ...p, enabled: !p.enabled } : p)),
    )
    try {
      const r = await apiFetch(`/notifications/preferences/${pref.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !pref.enabled }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch {
      setPreferences((prev) =>
        prev.map((p) => (p.id === pref.id ? { ...p, enabled: pref.enabled } : p)),
      )
      setError('Failed to save preference.')
    } finally {
      setSaving(null)
    }
  }

  function getPreference(channel: string, eventType: string): NotificationPreference | undefined {
    return preferences.find((p) => p.channel === channel && p.eventType === eventType)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Notification Preferences</h1>
      <p className="text-sm text-gray-500 mb-6">
        Choose which events trigger notifications and through which channels.
      </p>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>Loading…</span></div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-5 font-medium text-gray-700 w-48">Event</th>
                {CHANNELS.map((ch) => (
                  <th key={ch.key} className="text-center py-3 px-4 font-medium text-gray-700 w-24">
                    {ch.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENT_TYPES.map((evt) => (
                <tr key={evt.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-5 text-gray-800">{evt.label}</td>
                  {CHANNELS.map((ch) => {
                    const pref = getPreference(ch.key, evt.key)
                    return (
                      <td key={ch.key} className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={pref?.enabled ?? false}
                          disabled={saving === pref?.id || !pref}
                          onChange={() => pref && handleToggle(pref)}
                          className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                          aria-label={`${evt.label} via ${ch.label}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Channel setup instructions */}
      <div className="mt-8 flex flex-col gap-4">
        <Card>
          <h2 className="text-base font-medium mb-2">Connect Telegram Notifications</h2>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>Open Telegram and search for your bot (configured in your workspace settings).</li>
            <li>Send <code className="bg-gray-100 px-1 rounded">/start</code> to the bot.</li>
            <li>The bot will confirm your notifications are active.</li>
          </ol>
        </Card>
        <Card>
          <h2 className="text-base font-medium mb-2">Connect Slack Notifications</h2>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>In Slack, go to <strong>Apps</strong> and search for the Contento app.</li>
            <li>Install the app to your workspace and select the channel to receive notifications.</li>
            <li>Copy the incoming webhook URL and add it in your workspace CRM integrations.</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}
