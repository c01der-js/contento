'use client'

import { useEffect, useState } from 'react'
import { useApiFetch } from '@/lib/api'
import { Card, Spinner, ErrorBanner } from '@/components/ui'
import { useTranslations } from 'next-intl'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotificationPreference {
  id: string
  userId: string
  channel: string
  eventType: string
  enabled: boolean
}

type EventKey = 'PUBLISH_SUCCESS' | 'PUBLISH_FAILURE' | 'TREND_DIGEST' | 'APPROVAL_NEEDED' | 'COMMENT_MENTION'
type ChannelKey = 'in_app' | 'email' | 'telegram' | 'slack'

const EVENT_KEYS: EventKey[] = ['PUBLISH_SUCCESS', 'PUBLISH_FAILURE', 'TREND_DIGEST', 'APPROVAL_NEEDED', 'COMMENT_MENTION']
const CHANNEL_KEYS: ChannelKey[] = ['in_app', 'email', 'telegram', 'slack']

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const t = useTranslations('settings')
  const tCommon = useTranslations('common')
  const apiFetch = useApiFetch()

  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const EVENT_LABELS: Record<EventKey, string> = {
    PUBLISH_SUCCESS: t('eventPublishSuccess'),
    PUBLISH_FAILURE: t('eventPublishFailure'),
    TREND_DIGEST: t('eventTrendDigest'),
    APPROVAL_NEEDED: t('eventApprovalNeeded'),
    COMMENT_MENTION: t('eventCommentMention'),
  }

  const CHANNEL_LABELS: Record<ChannelKey, string> = {
    in_app: t('channelInApp'),
    email: t('channelEmail'),
    telegram: t('channelTelegram'),
    slack: t('channelSlack'),
  }

  async function load() {
    setIsLoading(true)
    try {
      const r = await apiFetch('/notifications/preferences')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: NotificationPreference[] = await r.json()
      setPreferences(Array.isArray(data) ? data : [])
    } catch {
      setError(t('loadPrefsError'))
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
      setError(t('savePrefError'))
    } finally {
      setSaving(null)
    }
  }

  function getPreference(channel: string, eventType: string): NotificationPreference | undefined {
    return preferences.find((p) => p.channel === channel && p.eventType === eventType)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">{t('notificationPreferences')}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {t('notificationDesc')}
      </p>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>{tCommon('loading')}</span></div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-5 font-medium text-gray-700 w-48">{t('eventColumn')}</th>
                {CHANNEL_KEYS.map((ch) => (
                  <th key={ch} className="text-center py-3 px-4 font-medium text-gray-700 w-24">
                    {CHANNEL_LABELS[ch]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENT_KEYS.map((evtKey) => (
                <tr key={evtKey} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-5 text-gray-800">{EVENT_LABELS[evtKey]}</td>
                  {CHANNEL_KEYS.map((ch) => {
                    const pref = getPreference(ch, evtKey)
                    return (
                      <td key={ch} className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={pref?.enabled ?? false}
                          disabled={saving === pref?.id || !pref}
                          onChange={() => pref && handleToggle(pref)}
                          className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
                          aria-label={`${EVENT_LABELS[evtKey]} via ${CHANNEL_LABELS[ch]}`}
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
          <h2 className="text-base font-medium mb-2">{t('telegramSetupTitle')}</h2>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>{t('telegramSetupStep1')}</li>
            <li>{t('telegramSetupStep2').split('/start').map((part, i) => i === 0
              ? part
              : <span key={i}><code className="bg-gray-100 px-1 rounded">/start</code>{part}</span>
            )}</li>
            <li>{t('telegramSetupStep3')}</li>
          </ol>
        </Card>
        <Card>
          <h2 className="text-base font-medium mb-2">{t('slackSetupTitle')}</h2>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>{t('slackSetupStep1')}</li>
            <li>{t('slackSetupStep2')}</li>
            <li>{t('slackSetupStep3')}</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}
