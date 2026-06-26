'use client'

import { useApiFetch } from '@/lib/api'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useWorkspace } from '@/lib/workspace'
import { useParams } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import {
  Button,
  Card,
  Badge,
  Spinner,
  EmptyState,
  ErrorBanner,
  Input,
} from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

type StoryStatus = 'NEW' | 'USED' | 'ARCHIVED'

interface StoryListItem {
  id: string
  title: string
  sourceUrl: string | null
  status: StoryStatus
  createdAt: string
  scriptCount: number
}

interface GeneratedScript {
  id: string
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
}

interface StoryScript {
  id: string
  hook: string
  status: string
}

interface StoryDetail extends StoryListItem {
  rawText: string
  scripts: StoryScript[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE_COLOR: Record<StoryStatus, 'indigo' | 'green' | 'default'> = {
  NEW: 'indigo',
  USED: 'green',
  ARCHIVED: 'default',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Add Story Form ─────────────────────────────────────────────────────────────

function AddStoryForm({
  workspaceId,
  apiFetch,
  onCreated,
}: {
  workspaceId: string
  apiFetch: ReturnType<typeof useApiFetch>
  onCreated: (story: StoryListItem) => void
}) {
  const t = useTranslations('stories')
  const tCommon = useTranslations('common')

  type Mode = 'paste' | 'url'
  const [mode, setMode] = useState<Mode>('paste')

  // paste mode
  const [title, setTitle] = useState('')
  const [rawText, setRawText] = useState('')

  // url mode
  const [url, setUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault()
    if (!rawText.trim()) return
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/stories`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() || undefined, rawText: rawText.trim() }),
      })
      if (!r.ok) throw new Error('save-failed')
      const story = (await r.json()) as StoryListItem
      onCreated(story)
      setTitle('')
      setRawText('')
    } catch {
      setError(t('errorSave'))
    } finally {
      setLoading(false)
    }
  }

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/stories/scrape`, {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!r.ok) throw new Error('scrape-failed')
      const story = (await r.json()) as StoryListItem
      onCreated(story)
      setUrl('')
    } catch {
      setError(t('errorScrape'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{t('addStory')}</h2>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => { setMode('paste'); setError(null) }}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors
            ${mode === 'paste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {t('modePaste')}
        </button>
        <button
          type="button"
          onClick={() => { setMode('url'); setError(null) }}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors
            ${mode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {t('modeUrl')}
        </button>
      </div>

      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      {mode === 'paste' ? (
        <form onSubmit={handlePaste} className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder={t('titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
          />
          <textarea
            placeholder={t('textPlaceholder')}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={loading}
            rows={5}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
              placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2
              focus:ring-indigo-100 disabled:opacity-50 resize-y"
          />
          <div className="flex justify-end">
            <Button type="submit" loading={loading} disabled={!rawText.trim()}>
              {tCommon('save')}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleScrape} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder={t('urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" loading={loading} disabled={!url.trim()}>
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Spinner className="h-3.5 w-3.5" />
                  {t('scraping')}
                </span>
              ) : (
                t('scrape')
              )}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// ── Story Row ──────────────────────────────────────────────────────────────────

function StoryRow({
  story,
  isSelected,
  onClick,
  t,
}: {
  story: StoryListItem
  isSelected: boolean
  onClick: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer border-b border-gray-100 transition-colors text-sm
        ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
    >
      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
        {story.title || <span className="text-gray-400 italic">{t('untitled')}</span>}
      </td>
      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
        {story.sourceUrl ? (
          <a
            href={story.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-indigo-600 hover:underline truncate block"
          >
            {story.sourceUrl}
          </a>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge color={STATUS_BADGE_COLOR[story.status]}>
          {t(`status${story.status}` as 'statusNEW' | 'statusUSED' | 'statusARCHIVED')}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-500 text-center">{story.scriptCount}</td>
      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(story.createdAt)}</td>
    </tr>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function StoryDetailPanel({
  storyId,
  workspaceId,
  apiFetch,
  onClose,
  onStoryUpdated,
  locale,
}: {
  storyId: string
  workspaceId: string
  apiFetch: ReturnType<typeof useApiFetch>
  onClose: () => void
  onStoryUpdated: (id: string, patch: Partial<StoryListItem>) => void
  locale: string
}) {
  const t = useTranslations('stories')
  const tCommon = useTranslations('common')

  const [detail, setDetail] = useState<StoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [latestScript, setLatestScript] = useState<GeneratedScript | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setDetail(null)
    setLatestScript(null)
    apiFetch(`/workspaces/${workspaceId}/stories/${storyId}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<StoryDetail>
      })
      .then(setDetail)
      .catch(() => setError(t('errorLoadDetail')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, workspaceId])

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/stories/${storyId}/generate`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!r.ok) throw new Error('generate-failed')
      const data = (await r.json()) as { script: GeneratedScript }
      setLatestScript(data.script)
      // Update the story in the list: status → USED, scriptCount++
      onStoryUpdated(storyId, { status: 'USED' })
      // Update detail scripts list
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: 'USED',
              scriptCount: prev.scriptCount + 1,
              scripts: [{ id: data.script.id, hook: data.script.hook, status: data.script.status }, ...prev.scripts],
            }
          : prev,
      )
    } catch {
      setGenerateError(t('errorGenerate'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900 truncate">
          {detail
            ? detail.title || <span className="italic text-gray-400">{t('untitled')}</span>
            : '…'}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {detail && !loading && (
        <>
          {/* Source URL */}
          {detail.sourceUrl && (
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">{t('source')}: </span>
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline break-all"
              >
                {detail.sourceUrl}
              </a>
            </div>
          )}

          {/* Raw text */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {t('rawText')}
            </p>
            <div
              className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed"
            >
              {detail.rawText}
            </div>
          </div>

          {/* Generate button */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleGenerate}
              loading={generating}
              disabled={generating}
              className="w-full"
            >
              {t('generateScript')}
            </Button>
            {generateError && <ErrorBanner message={generateError} />}
          </div>

          {/* Latest generated script preview */}
          {latestScript && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                {t('newScript')}
              </p>
              <p className="text-sm text-gray-800 leading-relaxed">
                <span className="font-medium text-gray-600">{t('hook')}: </span>
                {latestScript.hook}
              </p>
              <Link
                href="/review"
                className="text-xs text-indigo-600 hover:underline font-medium mt-1 self-start"
              >
                {t('goReview')} →
              </Link>
            </div>
          )}

          {/* Existing scripts */}
          {detail.scripts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {t('scripts')} ({detail.scripts.length})
              </p>
              <div className="flex flex-col gap-2">
                {detail.scripts.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-100 bg-white px-3 py-2 flex items-start justify-between gap-3"
                  >
                    <p className="text-sm text-gray-700 leading-relaxed flex-1 truncate">
                      {s.hook}
                    </p>
                    <Badge color={s.status === 'APPROVED' ? 'green' : s.status === 'REJECTED' ? 'red' : 'default'}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function StoriesPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('stories')
  const tCommon = useTranslations('common')
  const params = useParams()
  const locale = (params.locale as string) ?? 'en'

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError =
    status === 'no-workspaces'
      ? 'no-workspaces'
      : status === 'fetch-failed'
        ? 'fetch-failed'
        : null

  const [stories, setStories] = useState<StoryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    apiFetch(`/workspaces/${workspaceId}/stories`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<StoryListItem[]>
      })
      .then((data) => setStories(Array.isArray(data) ? data : []))
      .catch(() => setError(t('errorLoad')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function handleCreated(story: StoryListItem) {
    setStories((prev) => [story, ...prev])
  }

  function handleStoryUpdated(id: string, patch: Partial<StoryListItem>) {
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

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

  const showPanel = selectedId !== null && workspaceId !== null

  return (
    <div className={`flex gap-6 ${showPanel ? 'items-start' : ''}`}>
      {/* Left column: add form + list */}
      <div className={`flex flex-col min-w-0 ${showPanel ? 'w-1/2' : 'w-full'}`}>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t('title')}</h1>

        {/* Add story form */}
        {workspaceId && (
          <AddStoryForm
            workspaceId={workspaceId}
            apiFetch={apiFetch}
            onCreated={handleCreated}
          />
        )}

        {/* List */}
        {loading && (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
            <Spinner />
            <span>{tCommon('loading')}</span>
          </div>
        )}

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {!loading && !error && stories.length === 0 && (
          <EmptyState
            title={t('noStories')}
            description={t('noStoriesHint')}
            icon="📖"
          />
        )}

        {!loading && stories.length > 0 && (
          <Card padding={false} className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">{t('colTitle')}</th>
                  <th className="px-4 py-3 text-left">{t('colSource')}</th>
                  <th className="px-4 py-3 text-left">{t('colStatus')}</th>
                  <th className="px-4 py-3 text-left">{t('colScripts')}</th>
                  <th className="px-4 py-3 text-left">{t('colDate')}</th>
                </tr>
              </thead>
              <tbody>
                {stories.map((story) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    isSelected={selectedId === story.id}
                    onClick={() => setSelectedId(selectedId === story.id ? null : story.id)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Detail panel */}
      {showPanel && workspaceId && (
        <div
          className="w-1/2 shrink-0"
          style={{ maxHeight: 'calc(100vh - 7rem)', overflowY: 'auto' }}
        >
          <StoryDetailPanel
            storyId={selectedId!}
            workspaceId={workspaceId}
            apiFetch={apiFetch}
            onClose={() => setSelectedId(null)}
            onStoryUpdated={handleStoryUpdated}
            locale={locale}
          />
        </div>
      )}
    </div>
  )
}
