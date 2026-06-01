'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner, Input } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────


interface SocialAccount {
  id: string
  platform: string
  name: string
}

const OAUTH_PLATFORMS = ['meta', 'tiktok', 'youtube', 'x', 'linkedin'] as const
type OAuthPlatform = typeof OAUTH_PLATFORMS[number]

const PLATFORM_LABELS: Record<OAuthPlatform, string> = {
  meta: 'Meta (Facebook + Instagram)',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { getToken } = useAuth()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null

  async function apiFetch(path: string, options?: RequestInit) {
    const token = await getToken()
    return fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })
  }

  if (workspaceError === 'no-workspaces') {
    return <EmptyState title="No workspace found" description="Create a workspace first." />
  }
  if (workspaceError === 'fetch-failed') {
    return <div className="p-6"><ErrorBanner message="Failed to load workspace. Please refresh." /></div>
  }
  if (!workspaceId) {
    return <div className="p-6 flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>Loading…</span></div>
  }

  return <AccountsContent workspaceId={workspaceId} apiFetch={apiFetch} apiBase={apiBase} />
}

// ── Accounts Content ───────────────────────────────────────────────────────────

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

function AccountsContent({
  workspaceId,
  apiFetch,
  apiBase,
}: {
  workspaceId: string
  apiFetch: ApiFetch
  apiBase: string
}) {
  const searchParams = useSearchParams()
  const connectedPlatform = searchParams.get('connected')
  const oauthError = searchParams.get('error')

  const base = `/workspaces/${workspaceId}/social-accounts`
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((data: SocialAccount[]) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load accounts'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDelete(accountId: string) {
    try {
      const r = await apiFetch(`${base}/${accountId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    } catch {
      setError('Failed to delete account')
    }
  }

  function getConnectedAccount(platform: string): SocialAccount | undefined {
    return accounts.find((a) => a.platform === platform)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Connected Accounts</h1>

      {connectedPlatform && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Successfully connected {PLATFORM_LABELS[connectedPlatform as OAuthPlatform] ?? connectedPlatform}.
        </div>
      )}
      {oauthError && <div className="mb-4"><ErrorBanner message={`OAuth error: ${oauthError}`} /></div>}
      {isLoading && <div className="flex items-center gap-2 text-gray-400 text-sm mb-4"><Spinner /><span>Loading…</span></div>}
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      {/* OAuth platforms with Connect / Disconnect */}
      <section className="mb-8">
        <h2 className="text-base font-medium mb-3 text-gray-700">Social Platforms</h2>
        <div className="flex flex-col gap-3">
          {OAUTH_PLATFORMS.map((platform) => {
            const connected = getConnectedAccount(platform)
            return (
              <Card key={platform} padding={false}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge color="default">{platform.toUpperCase()}</Badge>
                    <span className="text-sm text-gray-800">{PLATFORM_LABELS[platform]}</span>
                    {connected && (
                      <Badge color="green">Connected: {connected.name}</Badge>
                    )}
                  </div>
                  {connected ? (
                    <Button variant="danger" size="sm" onClick={() => handleDelete(connected.id)}>
                      Disconnect
                    </Button>
                  ) : (
                    <a
                      href={`${apiBase}/oauth/${platform}/authorize?workspaceId=${encodeURIComponent(workspaceId)}`}
                      className="inline-flex items-center justify-center text-xs px-2.5 py-1.5 h-7 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                    >
                      Connect
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Telegram — manual bot token entry */}
      <section className="mb-6">
        <h2 className="text-base font-medium mb-3 text-gray-700">Telegram</h2>
        <TelegramForm
          connected={getConnectedAccount('telegram')}
          onDelete={handleDelete}
          apiFetch={apiFetch}
          base={base}
          onSuccess={load}
        />
      </section>

      {/* Legacy manual-token accounts (VK, Instagram direct) */}
      {!isLoading && accounts.filter((a) => !['meta', 'tiktok', 'youtube', 'x', 'linkedin', 'telegram'].includes(a.platform)).length > 0 && (
        <section>
          <h2 className="text-base font-medium mb-3 text-gray-700">Other Accounts</h2>
          <div className="flex flex-col gap-3">
            {accounts
              .filter((a) => !['meta', 'tiktok', 'youtube', 'x', 'linkedin', 'telegram'].includes(a.platform))
              .map((account) => (
                <Card key={account.id} padding={false}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge color="blue">{account.platform.toUpperCase()}</Badge>
                      <span className="text-sm text-gray-800">{account.name}</span>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(account.id)}>
                      Disconnect
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Telegram Form (bot token approach) ───────────────────────────────────────

function TelegramForm({
  connected,
  onDelete,
  apiFetch,
  base,
  onSuccess,
}: {
  connected: SocialAccount | undefined
  onDelete: (id: string) => void
  apiFetch: ApiFetch
  base: string
  onSuccess: () => void
}) {
  const [botToken, setBotToken] = useState('')
  const [channelId, setChannelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  if (connected) {
    return (
      <Card padding={false}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Badge color="default">TELEGRAM</Badge>
            <Badge color="green">Connected: {connected.name}</Badge>
          </div>
          <Button variant="danger" size="sm" onClick={() => onDelete(connected.id)}>
            Disconnect
          </Button>
        </div>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!botToken.trim() || !channelId.trim() || !displayName.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          platform: 'telegram',
          name: displayName.trim(),
          credentials: { botToken: botToken.trim(), channelId: channelId.trim() },
        }),
      })
      if (!r.ok) throw new Error('Failed to connect')
      setBotToken('')
      setChannelId('')
      setDisplayName('')
      onSuccess()
    } catch {
      setConnectError('Failed to connect Telegram account.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Card>
      {connectError && <div className="mb-3"><ErrorBanner message={connectError} /></div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Bot Token *</label>
          <Input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="1234567890:ABCdef..."
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Channel ID *</label>
          <Input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="@mychannel or -100123456789"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Display Name *</label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. My Telegram Channel"
            required
          />
        </div>
        <div>
          <Button type="submit" loading={connecting}>
            Connect
          </Button>
        </div>
      </form>
    </Card>
  )
}
