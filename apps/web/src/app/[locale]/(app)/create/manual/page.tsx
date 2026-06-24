'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApiFetch } from '@/lib/api'
import { useWorkspace } from '@/lib/workspace'
import { Link, useRouter } from '@/i18n/navigation'
import { Button, Spinner, EmptyState, ErrorBanner, Input } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────


interface SocialAccount {
  id: string
  platform: string
  name: string
}

interface Asset {
  id: string
  name: string
  url?: string
  mimeType?: string
}

// ── CharCounter ────────────────────────────────────────────────────────────────

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length
  return (
    <span
      className={[
        'text-xs',
        len > max ? 'text-red-500' : 'text-gray-400',
      ].join(' ')}
    >
      {len}/{max}
    </span>
  )
}

// ── HashtagInput ───────────────────────────────────────────────────────────────

function HashtagInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [inputVal, setInputVal] = useState('')

  function commit() {
    const raw = inputVal
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
    if (raw.length === 0) return
    const next = [...new Set([...value, ...raw])]
    onChange(next)
    setInputVal('')
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Backspace' && inputVal === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="border rounded-lg px-2 py-1.5 flex flex-wrap gap-1 min-h-[38px] focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-md"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="hover:text-red-500 leading-none"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={value.length === 0 ? 'e.g. marketing, growth' : ''}
        className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
      />
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const apiFetch = useApiFetch()
  const searchParams = useSearchParams()
  const router = useRouter()

  // workspace
  const { activeId, status } = useWorkspace()
  const workspaceId = searchParams.get('workspaceId') ?? activeId
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null

  // form — content
  const [hook, setHook] = useState('')
  const [body, setBody] = useState('')
  const [cta, setCta] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])

  // form — per-platform captions
  const [customizeCaptions, setCustomizeCaptions] = useState(false)
  const [captionInstagram, setCaptionInstagram] = useState('')
  const [captionTiktok, setCaptionTiktok] = useState('')
  const [captionYoutube, setCaptionYoutube] = useState('')

  // form — assets
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])

  // form — platforms
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // form — schedule
  const [publishMode, setPublishMode] = useState<'draft' | 'schedule'>('draft')
  const [scheduledAt, setScheduledAt] = useState('')
  const [runBrandCheck, setRunBrandCheck] = useState(false)

  // submission
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // load social accounts once workspace is known
  useEffect(() => {
    if (!workspaceId) return
    setAccountsLoading(true)
    apiFetch(`/workspaces/${workspaceId}/social-accounts`)
      .then((r) => r.json())
      .then((data: SocialAccount[]) => {
        const list = Array.isArray(data) ? data : []
        setSocialAccounts(list)
      })
      .catch(() => {})
      .finally(() => setAccountsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function openAssetPicker() {
    if (!workspaceId) return
    setShowAssetPicker(true)
    if (assets.length > 0) return
    setAssetsLoading(true)
    apiFetch(`/workspaces/${workspaceId}/assets`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Asset[]) => setAssets(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setAssetsLoading(false))
  }

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!workspaceId) return
    if (!hook.trim() || !body.trim() || !cta.trim()) return

    setSubmitting(true)
    setSubmitError('')

    const captions: Record<string, string> = { default: body }
    if (customizeCaptions) {
      if (captionInstagram.trim()) captions.instagram = captionInstagram.trim()
      if (captionTiktok.trim()) captions.tiktok = captionTiktok.trim()
      if (captionYoutube.trim()) captions.youtube = captionYoutube.trim()
    }

    const platforms =
      selectedPlatforms.length > 0
        ? selectedPlatforms
        : socialAccounts.map((a) => a.platform)

    const payload: Record<string, unknown> = {
      hook: hook.trim(),
      body: body.trim(),
      cta: cta.trim(),
      captions,
      hashtags,
      platforms: platforms.length > 0 ? platforms : ['instagram'],
      runBrandCheck,
      ...(selectedAssetIds.length > 0 ? { mediaAssetIds: selectedAssetIds } : {}),
      ...(publishMode === 'schedule' && scheduledAt
        ? { scheduledAt: new Date(scheduledAt).toISOString() }
        : {}),
    }

    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/manual`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
        throw new Error(err.error ?? 'Request failed')
      }
      router.push('/create')
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── early returns ────────────────────────────────────────────────────────────

  if (workspaceError === 'no-workspaces') {
    return <EmptyState title="No workspace found" description="Create a workspace first." />
  }
  if (workspaceError === 'fetch-failed') {
    return <div className="p-6"><ErrorBanner message="Failed to load workspace. Please refresh." /></div>
  }
  if (!workspaceId) {
    return <div className="p-6 flex items-center gap-2 text-gray-400 text-sm"><Spinner /><span>Loading…</span></div>
  }

  const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id))
  const canSubmit =
    hook.trim().length > 0 &&
    body.trim().length > 0 &&
    cta.trim().length > 0 &&
    !submitting

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/create"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Create Content
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-semibold">Manual Post</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* ── Section 1: Content Editor ───────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Content
          </h2>

          {/* Hook */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Hook <span className="text-red-500">*</span>
              </label>
              <CharCounter value={hook} max={150} />
            </div>
            <Input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="The one thing no one tells you about…"
              required
            />
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Body <span className="text-red-500">*</span>
              </label>
              <CharCounter value={body} max={2200} />
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              rows={6}
              placeholder="Write your main content here…"
              required
            />
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Call to Action <span className="text-red-500">*</span>
              </label>
              <CharCounter value={cta} max={100} />
            </div>
            <Input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="e.g. Follow for more tips!"
              required
            />
          </div>

          {/* Hashtags */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Hashtags</label>
            <HashtagInput value={hashtags} onChange={setHashtags} />
            <p className="text-xs text-gray-400">Press Enter or comma to add. Backspace to remove last.</p>
          </div>
        </section>

        {/* ── Section 2: Per-platform captions ────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Platform Captions
          </h2>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={customizeCaptions}
              onChange={(e) => setCustomizeCaptions(e.target.checked)}
              className="rounded"
            />
            Customize captions per platform
          </label>

          {customizeCaptions && (
            <div className="flex flex-col gap-3 pl-4 border-l-2 border-indigo-100">
              {[
                { label: 'Instagram', value: captionInstagram, setter: setCaptionInstagram, max: 2200 },
                { label: 'TikTok', value: captionTiktok, setter: setCaptionTiktok, max: 2200 },
                { label: 'YouTube', value: captionYoutube, setter: setCaptionYoutube, max: 5000 },
              ].map(({ label, value, setter, max }) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-600">{label}</label>
                    <CharCounter value={value} max={max} />
                  </div>
                  <textarea
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm resize-none placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    rows={3}
                    placeholder={`Caption for ${label}…`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 3: Media Assets ──────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Media Assets
          </h2>

          {selectedAssets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-1.5 border rounded px-2 py-1 text-xs text-gray-700 bg-gray-50"
                >
                  <span className="max-w-[120px] truncate">{asset.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className="text-red-400 hover:text-red-600 leading-none"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button type="button" variant="secondary" size="sm" onClick={openAssetPicker}>
            Attach Assets
          </Button>

          {/* Asset picker overlay */}
          {showAssetPicker && (
            <div className="border rounded p-4 flex flex-col gap-3 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Select Assets</p>
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>

              {assetsLoading && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Spinner />
                  <span>Loading assets…</span>
                </div>
              )}

              {!assetsLoading && assets.length === 0 && (
                <p className="text-sm text-gray-400">No assets found in this workspace.</p>
              )}

              {!assetsLoading && assets.length > 0 && (
                <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {assets.map((asset) => (
                    <li key={asset.id}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedAssetIds.includes(asset.id)}
                          onChange={() => toggleAsset(asset.id)}
                        />
                        <span className="truncate">{asset.name}</span>
                        {asset.mimeType && (
                          <span className="text-xs text-gray-400 shrink-0">{asset.mimeType}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Section 4: Platform Selection ───────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Platforms
          </h2>

          {accountsLoading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Spinner />
              <span>Loading accounts…</span>
            </div>
          )}

          {!accountsLoading && socialAccounts.length === 0 && (
            <p className="text-sm text-gray-500">
              No accounts connected.{' '}
              <Link href="/settings/accounts" className="text-indigo-600 hover:underline">
                Connect one in Settings.
              </Link>
            </p>
          )}

          {!accountsLoading && socialAccounts.length > 0 && (
            <div className="flex flex-col gap-2">
              {socialAccounts.map((acc) => (
                <label
                  key={acc.id}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(acc.platform)}
                    onChange={() => togglePlatform(acc.platform)}
                    className="rounded"
                  />
                  <span className="font-medium capitalize">{acc.platform}</span>
                  <span className="text-gray-400">— {acc.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 5: Schedule & Options ───────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Schedule
          </h2>

          <div className="flex gap-3">
            {(['draft', 'schedule'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPublishMode(mode)}
                className={[
                  'px-4 py-2 rounded-lg text-sm border transition-colors font-medium',
                  publishMode === mode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'text-gray-600 border-gray-300 hover:bg-gray-50',
                ].join(' ')}
              >
                {mode === 'draft' ? 'Save Draft' : 'Schedule'}
              </button>
            ))}
          </div>

          {publishMode === 'schedule' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Scheduled date &amp; time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm w-fit focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={runBrandCheck}
              onChange={(e) => setRunBrandCheck(e.target.checked)}
              className="rounded"
            />
            Run Brand Check
          </label>
        </section>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        {submitError && (
          <ErrorBanner message={submitError} />
        )}

        <div className="flex items-center gap-3 pb-8">
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={submitting}
          >
            {submitting
              ? 'Saving…'
              : publishMode === 'schedule'
                ? 'Schedule'
                : 'Save Draft'}
          </Button>
          <Link
            href="/create"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
