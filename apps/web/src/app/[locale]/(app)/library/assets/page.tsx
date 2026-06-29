'use client'

import { getAuthToken } from '@/lib/auth'
import { useApiFetch, API_BASE } from '@/lib/api'
import { useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { Link } from '@/i18n/navigation'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

type AssetKind = 'BROLL' | 'PRODUCT' | 'REFERENCE' | 'VOICE_SAMPLE'

interface Asset {
  id: string
  workspaceId: string
  kind: AssetKind
  url: string
  thumbnailUrl: string | null
  mimeType: string | null
  tags: string[]
  meta: unknown
  createdAt: string
}

interface AssetListResponse {
  assets: Asset[]
  nextCursor: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<AssetKind, string> = {
  BROLL: 'B-Roll',
  PRODUCT: 'Product',
  REFERENCE: 'Reference',
  VOICE_SAMPLE: 'Voice Sample',
}

type BadgeColor = 'purple' | 'blue' | 'green' | 'orange'

const KIND_BADGE_COLOR: Record<AssetKind, BadgeColor> = {
  BROLL: 'purple',
  PRODUCT: 'blue',
  REFERENCE: 'green',
  VOICE_SAMPLE: 'orange',
}

const ALL_KINDS: (AssetKind | 'ALL')[] = ['ALL', 'BROLL', 'PRODUCT', 'REFERENCE', 'VOICE_SAMPLE']

// ── Asset Card ─────────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onDelete,
  deleting,
}: {
  asset: Asset
  onDelete: (id: string) => void
  deleting: boolean
}) {
  const t = useTranslations('library')
  const isImage = asset.mimeType?.startsWith('image/') ?? false
  const isAudio = asset.mimeType?.startsWith('audio/') ?? false
  const isVideo = asset.mimeType?.startsWith('video/') ?? false
  const filename = (asset.meta as Record<string, unknown> | null)?.['filename'] as string | undefined

  return (
    <Card padding={false} className="flex flex-col overflow-hidden">
      {/* Thumbnail / icon area */}
      <div className="h-32 bg-gray-100 flex items-center justify-center relative">
        {isImage && asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl}
            alt={filename ?? 'asset'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl">
            {isAudio ? '🎵' : isVideo ? '🎬' : '📄'}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Badge color={KIND_BADGE_COLOR[asset.kind]}>{KIND_LABELS[asset.kind]}</Badge>
        </div>
        {filename && (
          <p className="text-xs text-gray-700 truncate" title={filename}>
            {filename}
          </p>
        )}
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-1">
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(asset.id)}
            disabled={deleting}
            loading={deleting}
          >
            {t('delete')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const apiFetch = useApiFetch()
  const t = useTranslations('library')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()

  const { activeId, status } = useWorkspace()
  const workspaceId = searchParams.get('workspaceId') ?? activeId
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [assets, setAssets] = useState<Asset[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<AssetKind | 'ALL'>('ALL')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function buildQuery(cursor?: string) {
    const params = new URLSearchParams()
    if (kindFilter !== 'ALL') params.set('kind', kindFilter)
    if (cursor) params.set('cursor', cursor)
    params.set('limit', '20')
    return params.toString()
  }

  // Load assets
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    setAssets([])
    setNextCursor(null)
    apiFetch(`/workspaces/${workspaceId}/assets?${buildQuery()}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch-failed')
        return r.json() as Promise<AssetListResponse>
      })
      .then((data) => {
        setAssets(data.assets)
        setNextCursor(data.nextCursor)
      })
      .catch(() => setError(t('assetsLoadError')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, kindFilter])

  async function loadMore() {
    if (!workspaceId || !nextCursor) return
    setLoadingMore(true)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/assets?${buildQuery(nextCursor)}`,
      )
      if (!r.ok) throw new Error('fetch-failed')
      const data = (await r.json()) as AssetListResponse
      setAssets((prev) => [...prev, ...data.assets])
      setNextCursor(data.nextCursor)
    } catch {
      setError(t('assetsLoadMoreError'))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleDelete(assetId: string) {
    if (!workspaceId) return
    setDeletingId(assetId)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/assets/${assetId}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error('delete-failed')
      setAssets((prev) => prev.filter((a) => a.id !== assetId))
    } catch {
      setError(t('assetDeleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!workspaceId) return
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'REFERENCE')
      // Multipart upload: send the FormData without a JSON Content-Type so the browser sets
      // the multipart boundary itself. The shared apiFetch always injects application/json,
      // so this one call uses a direct fetch with the bearer token.
      const token = getAuthToken()
      const r = await fetch(`${API_BASE}/workspaces/${workspaceId}/assets`, {
        method: 'POST',
        body: form,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!r.ok) throw new Error('upload-failed')
      const asset = (await r.json()) as Asset
      setAssets((prev) => [asset, ...prev])
    } catch {
      setError(t('assetUploadError'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/library">
            <Button variant="ghost" size="sm">← {t('title')}</Button>
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{t('assets')}</h1>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            accept="image/*,video/*,audio/*,.pdf"
          />
          <Button
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !workspaceId}
            loading={uploading}
          >
            {t('upload')}
          </Button>
        </div>
      </div>

      {/* Kind filter */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {ALL_KINDS.map((k) => (
          <Button
            key={k}
            variant={kindFilter === k ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setKindFilter(k)}
          >
            {k === 'ALL' ? t('all') : KIND_LABELS[k]}
          </Button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm py-8">
          <Spinner />
          <span>{tCommon('loading')}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && assets.length === 0 && (
        <EmptyState
          title={t('noAssets')}
          description={t('assetsDesc')}
          icon="🗂️"
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={!workspaceId}
            >
              {t('upload')}
            </Button>
          }
        />
      )}

      {/* Grid */}
      {!loading && assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onDelete={handleDelete}
              deleting={deletingId === asset.id}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextCursor && !loading && (
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={loadMore}
            disabled={loadingMore}
            loading={loadingMore}
          >
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
