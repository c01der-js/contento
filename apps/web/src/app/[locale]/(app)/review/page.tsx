'use client'

import { useApiFetch } from '@/lib/api'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useWorkspace } from '@/lib/workspace'
import {
  Button,
  Card,
  Badge,
  Spinner,
  EmptyState,
  ErrorBanner,
  StatusBadge,
} from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Script {
  id: string
  workspaceId: string
  ideaId: string
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
  brandCheckScore: number | null
  brandCheckNotes: string | null
  brandCheckCriteria: unknown
  submittedById: string | null
  createdAt: string
  updatedAt: string
}

// ── Score Badge ────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'green'
      : score >= 50
        ? 'yellow'
        : 'red'
  return (
    <Badge color={color as 'green' | 'yellow' | 'red'}>
      {score}/100
    </Badge>
  )
}

// ── Script Card ────────────────────────────────────────────────────────────────

function ScriptCard({
  script,
  onApprove,
  onReject,
  processing,
}: {
  script: Script
  onApprove: (id: string) => void
  onReject: (id: string, comment: string) => void
  processing: boolean
}) {
  const t = useTranslations('review')
  const tCommon = useTranslations('common')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [comment, setComment] = useState('')

  const bodyExcerpt = script.body.length > 200 ? script.body.slice(0, 200) + '…' : script.body
  const submittedAt = new Date(script.updatedAt).toLocaleString()

  function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    onReject(script.id, comment.trim())
  }

  return (
    <Card className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Hook</p>
          <p className="text-base font-medium text-gray-900 leading-snug">{script.hook}</p>
        </div>
        <div className="shrink-0 mt-1 flex items-center gap-2">
          <StatusBadge status={script.status} />
          {script.brandCheckScore !== null && (
            <ScoreBadge score={script.brandCheckScore} />
          )}
        </div>
      </div>

      {/* Body excerpt */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</p>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{bodyExcerpt}</p>
      </div>

      {/* Caption */}
      {script.caption && (
        <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Caption</p>
          <p className="text-sm text-gray-600">{script.caption}</p>
        </div>
      )}

      {/* Brand check notes */}
      {script.brandCheckNotes && (
        <div className="border border-indigo-100 rounded-lg p-3 bg-indigo-50">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Brand Check Notes</p>
          <p className="text-sm text-indigo-800">{script.brandCheckNotes}</p>
        </div>
      )}

      {/* Meta */}
      <p className="text-xs text-gray-400">Submitted {submittedAt}</p>

      {/* Actions */}
      {!rejectOpen && (
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onApprove(script.id)}
            disabled={processing}
            loading={processing}
          >
            {tCommon('approve')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setRejectOpen(true)}
            disabled={processing}
          >
            {tCommon('reject')}
          </Button>
        </div>
      )}

      {/* Inline reject form */}
      {rejectOpen && (
        <form onSubmit={handleRejectSubmit} className="flex flex-col gap-3 pt-1 border-t border-gray-100">
          <label className="text-xs font-medium text-gray-600">
            {t('rejectPlaceholder')} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none
              placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2
              focus:ring-indigo-100 disabled:opacity-50"
            rows={3}
            placeholder={t('rejectPlaceholder')}
            required
            minLength={1}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={processing || !comment.trim()}
              loading={processing}
            >
              {t('submitReject')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setRejectOpen(false); setComment('') }}
              disabled={processing}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('review')
  const tCommon = useTranslations('common')

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Load review queue
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    apiFetch(`/workspaces/${workspaceId}/review-queue`)
      .then((r) => {
        if (r.status === 403) throw new Error('forbidden')
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<Script[]>
      })
      .then((data) => setScripts(data))
      .catch((err: Error) => {
        if (err.message === 'forbidden') {
          setError('You do not have permission to view the review queue.')
        } else {
          setError('Failed to load the review queue. Please refresh.')
        }
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function handleApprove(scriptId: string) {
    if (!workspaceId) return
    setProcessingId(scriptId)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/approve`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error('Failed to approve')
      setScripts((prev) => prev.filter((s) => s.id !== scriptId))
    } catch {
      setError('Failed to approve script. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(scriptId: string, comment: string) {
    if (!workspaceId) return
    setProcessingId(scriptId)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ comment }),
        },
      )
      if (!r.ok) throw new Error('Failed to reject')
      setScripts((prev) => prev.filter((s) => s.id !== scriptId))
    } catch {
      setError('Failed to reject script. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState
          title={tCommon('noWorkspaces')}
          description="Create a workspace to get started."
          icon="🏢"
        />
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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t('title')}</h1>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {!loading && !error && scripts.length === 0 && (
        <EmptyState
          title={t('noScripts')}
          description="All scripts have been reviewed."
          icon="✅"
        />
      )}

      {!loading && scripts.length > 0 && (
        <div className="flex flex-col gap-4">
          {scripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              onApprove={handleApprove}
              onReject={handleReject}
              processing={processingId === script.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
