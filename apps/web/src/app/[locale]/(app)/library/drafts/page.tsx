'use client'

import { useApiFetch } from '@/lib/api'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { Link } from '@/i18n/navigation'
import { Button, Card, StatusBadge, Spinner, EmptyState, ErrorBanner } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Script {
  id: string
  workspaceId: string
  ideaId: string | null
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
  brandCheckScore: number | null
  brandCheckNotes: string | null
  brandCheckCriteria: unknown
  autoFixes: unknown
  submittedById: string | null
  createdAt: string
  updatedAt: string
}

// ── Draft Card ─────────────────────────────────────────────────────────────────

function DraftCard({ script }: { script: Script }) {
  const t = useTranslations('library')
  const hookExcerpt =
    script.hook.length > 100 ? script.hook.slice(0, 100) + '…' : script.hook
  const createdDate = new Date(script.createdAt).toLocaleDateString()

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={script.status} />
        <span className="text-xs text-gray-400">{createdDate}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 leading-snug">{hookExcerpt}</p>
      <div className="flex items-center gap-2">
        <Link href={`/review?scriptId=${script.id}`}>
          <Button variant="primary" size="sm">{t('review')}</Button>
        </Link>
      </div>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DraftsPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('library')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()

  const { activeId, status } = useWorkspace()
  const workspaceId = searchParams.get('workspaceId') ?? activeId
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load drafts
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    apiFetch(
      `/workspaces/${workspaceId}/scripts?status=DRAFT,IN_REVIEW`,
    )
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<Script[]>
      })
      .then((data) => setScripts(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load drafts. Please refresh.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState title={tCommon('noWorkspaces')} icon="🏢" />
      </div>
    )
  }
  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message={tCommon('failedWorkspace')} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/library">
          <Button variant="ghost" size="sm">← {t('title')}</Button>
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">{t('drafts')}</h1>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 max-w-5xl">
          <ErrorBanner message={error} />
        </div>
      )}

      {!loading && !error && scripts.length === 0 && (
        <div className="max-w-2xl">
          <EmptyState
            title={t('noDrafts')}
            description="Scripts in DRAFT or IN_REVIEW status will appear here."
            icon="📝"
          />
        </div>
      )}

      {!loading && scripts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {scripts.map((script) => (
            <DraftCard key={script.id} script={script} />
          ))}
        </div>
      )}
    </div>
  )
}
