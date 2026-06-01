'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { Button, Card, Badge, Spinner, EmptyState, ErrorBanner, Input, Select } from '@/components/ui'

// ── Types ──────────────────────────────────────────────────────────────────────


interface BrandTone {
  id: string
  name: string
  description?: string
  examples?: string[]
  adjectives?: string[]
  examplesPositive?: string[]
  examplesNegative?: string[]
  values?: string[]
  manifesto?: string | null
}

interface BrandPillar {
  id: string
  name: string
  description?: string
  keywords?: string[]
}

interface BrandVocabulary {
  id: string
  word: string
  type: 'ALLOW' | 'FORBID'
}

interface Persona {
  id: string
  name: string
  description?: string
  painPoints?: string[]
  desires?: string[]
}

interface VisualIdentity {
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fontPrimary?: string
  fontSecondary?: string
  logoUrl?: string
  watermarkUrl?: string
  logoFullUrl?: string
  logoIconUrl?: string
  logoLightUrl?: string
  logoDarkUrl?: string
}

interface Competitor {
  id: string
  name: string
  url?: string
  notes?: string
}

interface GoldenExample {
  id: string
  title: string
  content: string
  format: string
  platform: string
}

interface AntiExample {
  id: string
  title: string
  content: string
  format?: string | null
  platform?: string | null
  reason?: string | null
}

interface TabooTopic {
  id: string
  topic: string
  reason?: string | null
}

interface Goal {
  id: string
  type: 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'
  targetValue?: number | null
  currentValue?: number | null
  deadline?: string | null
}

interface BrandPreviewItem {
  hook: string
  body: string
  cta: string
  caption: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
  'Voice & Tone',
  'Pillars',
  'Vocabulary',
  'Personas',
  'Visual Identity',
  'Competitors',
  'Golden Examples',
  'Anti-Examples',
  'Taboo Topics',
  'Goals',
] as const

type TabName = (typeof TABS)[number]

const GOLDEN_EXAMPLE_FORMATS = [
  'reel',
  'carousel',
  'single-image',
  'story',
  'short-video',
  'long-video',
  'text-post',
  'image-post',
  'thread',
] as const

const GOAL_TYPES = ['SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH'] as const

// ── Helpers ────────────────────────────────────────────────────────────────────

function splitComma(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ── Shared field label ─────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-gray-700">{children}</label>
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BrandPage() {
  const { getToken } = useAuth()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [activeTab, setActiveTab] = useState<TabName>('Voice & Tone')

  // Brand preview modal state
  const [showPreview, setShowPreview] = useState(false)
  const [previews, setPreviews] = useState<BrandPreviewItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

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

  async function handlePreviewBrandVoice() {
    if (!workspaceId) return
    setPreviewLoading(true)
    setPreviewError('')
    setPreviews([])
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/brand-preview`, { method: 'POST' })
      if (!r.ok) throw new Error('Failed')
      const data = await r.json() as BrandPreviewItem[]
      setPreviews(data)
      setShowPreview(true)
    } catch {
      setPreviewError('Failed to generate brand preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">Create a workspace first.</p>
      </div>
    )
  }

  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message="Failed to load workspace. Please refresh." />
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="p-6 flex items-center gap-3 text-sm text-gray-600">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Brand Kit</h1>
        <div className="flex items-center gap-3">
          {previewError && <ErrorBanner message={previewError} />}
          <Button
            variant="primary"
            onClick={handlePreviewBrandVoice}
            loading={previewLoading}
            className="bg-purple-600 border-purple-600 hover:bg-purple-700 hover:border-purple-700"
          >
            {previewLoading ? 'Generating…' : 'Preview Brand Voice'}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === tab
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-800 border-b-2 border-transparent',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Voice & Tone' && (
        <TonesTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Pillars' && (
        <PillarsTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Vocabulary' && (
        <VocabularyTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Personas' && (
        <PersonasTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Visual Identity' && (
        <VisualIdentityTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Competitors' && (
        <CompetitorsTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Golden Examples' && (
        <GoldenExamplesTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Anti-Examples' && (
        <AntiExamplesTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Taboo Topics' && (
        <TabooTopicsTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
      {activeTab === 'Goals' && (
        <GoalsTab workspaceId={workspaceId} apiFetch={apiFetch} />
      )}

      {/* Brand Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Brand Voice Preview</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              3 sample content pieces generated using your brand settings.
            </p>
            <div className="flex flex-col gap-4">
              {previews.map((item, i) => (
                <Card key={i}>
                  <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                    Sample {i + 1}
                  </p>
                  <p className="font-semibold text-sm text-gray-900 mb-1">Hook: {item.hook}</p>
                  <p className="text-sm text-gray-600 mb-1">{item.body}</p>
                  <p className="text-sm text-indigo-600 mb-1">CTA: {item.cta}</p>
                  <p className="text-xs text-gray-400">Caption: {item.caption}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared types ───────────────────────────────────────────────────────────────

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

// ── Voice & Tone Tab ───────────────────────────────────────────────────────────

function TonesTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/tones`
  const [items, setItems] = useState<BrandTone[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [examples, setExamples] = useState('')
  const [adjectives, setAdjectives] = useState('')
  const [examplesPositive, setExamplesPositive] = useState('')
  const [examplesNegative, setExamplesNegative] = useState('')
  const [values, setValues] = useState('')
  const [manifesto, setManifesto] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: BrandTone[]) => setItems(d))
      .catch(() => setError('Failed to load tones'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          examples: examples.trim() ? splitComma(examples) : undefined,
          adjectives: adjectives.trim() ? splitComma(adjectives) : undefined,
          examplesPositive: examplesPositive.trim() ? splitComma(examplesPositive) : undefined,
          examplesNegative: examplesNegative.trim() ? splitComma(examplesNegative) : undefined,
          values: values.trim() ? splitComma(values) : undefined,
          manifesto: manifesto.trim() || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setName('')
      setDescription('')
      setExamples('')
      setAdjectives('')
      setExamplesPositive('')
      setExamplesNegative('')
      setValues('')
      setManifesto('')
      load()
    } catch {
      setError('Failed to add tone')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                )}
                {item.examples && item.examples.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Examples: {item.examples.join(', ')}
                  </p>
                )}
                {item.adjectives && item.adjectives.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Adjectives: {item.adjectives.join(', ')}
                  </p>
                )}
                {item.values && item.values.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Values: {item.values.join(', ')}
                  </p>
                )}
                {item.manifesto && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                    Manifesto: {item.manifesto}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No tones yet" description="Add a brand voice tone below." icon="🎙️" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Tone</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>Name *</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-40"
                placeholder="e.g. Friendly"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Description</FieldLabel>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-48"
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Examples (comma-separated)</FieldLabel>
              <Input
                value={examples}
                onChange={(e) => setExamples(e.target.value)}
                className="w-56"
                placeholder="e.g. example1, example2"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>Adjectives (comma-separated)</FieldLabel>
              <Input
                value={adjectives}
                onChange={(e) => setAdjectives(e.target.value)}
                className="w-56"
                placeholder="e.g. bold, warm, direct"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Values (comma-separated)</FieldLabel>
              <Input
                value={values}
                onChange={(e) => setValues(e.target.value)}
                className="w-56"
                placeholder="e.g. integrity, growth"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <FieldLabel>Positive Examples (comma-separated)</FieldLabel>
              <textarea
                value={examplesPositive}
                onChange={(e) => setExamplesPositive(e.target.value)}
                className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="e.g. We empower creators…"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <FieldLabel>Negative Examples (comma-separated)</FieldLabel>
              <textarea
                value={examplesNegative}
                onChange={(e) => setExamplesNegative(e.target.value)}
                className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="e.g. Synergy-driven solutions…"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Manifesto</FieldLabel>
            <textarea
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              className="w-full h-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Brand manifesto text…"
            />
          </div>
          <div>
            <Button type="submit" variant="primary" loading={adding}>
              {adding ? 'Adding…' : 'Add Tone'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ── Pillars Tab ────────────────────────────────────────────────────────────────

function PillarsTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/pillars`
  const [items, setItems] = useState<BrandPillar[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [keywords, setKeywords] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: BrandPillar[]) => setItems(d))
      .catch(() => setError('Failed to load pillars'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          keywords: keywords.trim() ? splitComma(keywords) : undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setName('')
      setDescription('')
      setKeywords('')
      load()
    } catch {
      setError('Failed to add pillar')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                )}
                {item.keywords && item.keywords.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Keywords: {item.keywords.join(', ')}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No pillars yet" description="Add your brand pillars below." icon="🏛️" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Pillar</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Name *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder="e.g. Innovation"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Description</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-48"
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Keywords (comma-separated)</FieldLabel>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-56"
              placeholder="e.g. growth, impact"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Vocabulary Tab ─────────────────────────────────────────────────────────────

function VocabularyTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/vocabulary`
  const [items, setItems] = useState<BrandVocabulary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [word, setWord] = useState('')
  const [type, setType] = useState<'ALLOW' | 'FORBID'>('ALLOW')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: BrandVocabulary[]) => setItems(d))
      .catch(() => setError('Failed to load vocabulary'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!word.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({ word: word.trim(), type }),
      })
      if (!r.ok) throw new Error('Failed')
      setWord('')
      setType('ALLOW')
      load()
    } catch {
      setError('Failed to add word')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge color={item.type === 'ALLOW' ? 'green' : 'red'}>{item.type}</Badge>
                <span className="text-sm text-gray-900">{item.word}</span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No vocabulary entries" description="Add allowed and forbidden words below." icon="📖" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Word</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Word *</FieldLabel>
            <Input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-40"
              placeholder="e.g. synergy"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Type</FieldLabel>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as 'ALLOW' | 'FORBID')}
            >
              <option value="ALLOW">ALLOW</option>
              <option value="FORBID">FORBID</option>
            </Select>
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Personas Tab ───────────────────────────────────────────────────────────────

function PersonasTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/personas`
  const [items, setItems] = useState<Persona[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [painPoints, setPainPoints] = useState('')
  const [desires, setDesires] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: Persona[]) => setItems(d))
      .catch(() => setError('Failed to load personas'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          painPoints: painPoints.trim() ? splitComma(painPoints) : undefined,
          desires: desires.trim() ? splitComma(desires) : undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setName('')
      setDescription('')
      setPainPoints('')
      setDesires('')
      load()
    } catch {
      setError('Failed to add persona')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                {item.description && (
                  <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                )}
                {item.painPoints && item.painPoints.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pain points: {item.painPoints.join(', ')}
                  </p>
                )}
                {item.desires && item.desires.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Desires: {item.desires.join(', ')}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No personas yet" description="Add audience personas below." icon="👤" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Persona</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Name *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder="e.g. Startup Founder"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Description</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-48"
              placeholder="Optional"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Pain Points (comma-separated)</FieldLabel>
            <Input
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              className="w-56"
              placeholder="e.g. time, budget"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Desires (comma-separated)</FieldLabel>
            <Input
              value={desires}
              onChange={(e) => setDesires(e.target.value)}
              className="w-56"
              placeholder="e.g. growth, impact"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Visual Identity Tab ────────────────────────────────────────────────────────

function VisualIdentityTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/visual-identity`
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fields, setFields] = useState<VisualIdentity>({})

  useEffect(() => {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VisualIdentity | null) => {
        if (d) setFields(d)
      })
      .catch(() => setError('Failed to load visual identity'))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setField(key: keyof VisualIdentity, value: string) {
    setFields((prev) => ({ ...prev, [key]: value || undefined }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const r = await apiFetch(base, {
        method: 'PUT',
        body: JSON.stringify(fields),
      })
      if (!r.ok) throw new Error('Failed')
      setSuccess(true)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg">
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Saved!
        </div>
      )}

      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide text-xs">Colors &amp; Fonts</p>
        <div className="flex flex-col gap-3">
          {(
            [
              ['primaryColor', 'Primary Color'],
              ['secondaryColor', 'Secondary Color'],
              ['accentColor', 'Accent Color'],
              ['fontPrimary', 'Primary Font'],
              ['fontSecondary', 'Secondary Font'],
            ] as [keyof VisualIdentity, string][]
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-sm text-gray-600 w-36 shrink-0">{label}</label>
              <Input
                value={fields[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                className="w-48"
                placeholder={key.includes('Color') ? '#000000' : ''}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide text-xs">Logo Variants</p>
        <div className="flex flex-col gap-3">
          {(
            [
              ['logoUrl', 'Logo URL (default)'],
              ['logoFullUrl', 'Full Logo URL'],
              ['logoIconUrl', 'Icon Logo URL'],
              ['logoLightUrl', 'Light Logo URL'],
              ['logoDarkUrl', 'Dark Logo URL'],
              ['watermarkUrl', 'Watermark URL'],
            ] as [keyof VisualIdentity, string][]
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-sm text-gray-600 w-36 shrink-0">{label}</label>
              <Input
                value={fields[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                className="w-48"
                placeholder="https://..."
              />
            </div>
          ))}
        </div>
      </Card>

      <div>
        <Button type="submit" variant="primary" loading={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

// ── Competitors Tab ────────────────────────────────────────────────────────────

function CompetitorsTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/competitors`
  const [items, setItems] = useState<Competitor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: Competitor[]) => setItems(d))
      .catch(() => setError('Failed to load competitors'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setName('')
      setUrl('')
      setNotes('')
      load()
    } catch {
      setError('Failed to add competitor')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 text-xs hover:underline"
                  >
                    {item.url}
                  </a>
                )}
                {item.notes && (
                  <p className="text-sm text-gray-600 mt-0.5">{item.notes}</p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No competitors tracked" description="Add competitors to monitor below." icon="🏁" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Competitor</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Name *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>URL</FieldLabel>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-48"
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Notes</FieldLabel>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-56"
              placeholder="Optional"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Golden Examples Tab ────────────────────────────────────────────────────────

function GoldenExamplesTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/golden-examples`
  const [items, setItems] = useState<GoldenExample[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [format, setFormat] = useState<string>(GOLDEN_EXAMPLE_FORMATS[0])
  const [platform, setPlatform] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: GoldenExample[]) => setItems(d))
      .catch(() => setError('Failed to load golden examples'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim() || !platform.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          format,
          platform: platform.trim(),
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setTitle('')
      setContent('')
      setFormat(GOLDEN_EXAMPLE_FORMATS[0])
      setPlatform('')
      load()
    } catch {
      setError('Failed to add golden example')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.format} · {item.platform}
                </p>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.content}</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No golden examples" description="Add great content examples below." icon="⭐" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Golden Example</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Title *</FieldLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-40"
              placeholder="e.g. Launch Reel"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Content *</FieldLabel>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-56"
              placeholder="Content text…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Format</FieldLabel>
            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {GOLDEN_EXAMPLE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Platform *</FieldLabel>
            <Input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-32"
              placeholder="e.g. Instagram"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Anti-Examples Tab ──────────────────────────────────────────────────────────

function AntiExamplesTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/anti-examples`
  const [items, setItems] = useState<AntiExample[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [format, setFormat] = useState('')
  const [platform, setPlatform] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: AntiExample[]) => setItems(d))
      .catch(() => setError('Failed to load anti-examples'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          format: format.trim() || undefined,
          platform: platform.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setTitle('')
      setContent('')
      setFormat('')
      setPlatform('')
      setReason('')
      load()
    } catch {
      setError('Failed to add anti-example')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Anti-examples are content pieces that violate your brand guidelines. Use them to train the AI on what to avoid.
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between border-red-100 bg-red-50/30">
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900">{item.title}</p>
                {(item.format || item.platform) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[item.format, item.platform].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.content}</p>
                {item.reason && (
                  <p className="text-xs text-orange-600 mt-0.5">Reason: {item.reason}</p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No anti-examples" description="Add content to avoid below." icon="🚫" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Anti-Example</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>Title *</FieldLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-40"
                placeholder="e.g. Cringy promo"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Format</FieldLabel>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-32"
                placeholder="e.g. reel"
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>Platform</FieldLabel>
              <Input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-32"
                placeholder="e.g. TikTok"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Content *</FieldLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Paste the bad example content here…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Reason (why is this bad?)</FieldLabel>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full"
              placeholder="e.g. Uses forbidden words, off-brand tone"
            />
          </div>
          <div>
            <Button type="submit" variant="danger" loading={adding}>
              {adding ? 'Adding…' : 'Add Anti-Example'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ── Taboo Topics Tab ───────────────────────────────────────────────────────────

function TabooTopicsTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/brand/taboo-topics`
  const [items, setItems] = useState<TabooTopic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [topic, setTopic] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: TabooTopic[]) => setItems(d))
      .catch(() => setError('Failed to load taboo topics'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(),
          reason: reason.trim() || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setTopic('')
      setReason('')
      load()
    } catch {
      setError('Failed to add taboo topic')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Taboo topics are subjects the AI will avoid in all generated content.
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      {/* Tag list */}
      <div className="flex flex-wrap gap-2 mb-6">
        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded-full text-sm"
          >
            {item.topic}
            {item.reason && (
              <span className="text-orange-400 text-xs" title={item.reason}>
                (?)
              </span>
            )}
            <button
              onClick={() => handleDelete(item.id)}
              className="text-orange-400 hover:text-orange-700 text-xs leading-none ml-1"
              aria-label={`Remove ${item.topic}`}
            >
              &times;
            </button>
          </span>
        ))}
        {items.length === 0 && !isLoading && (
          <p className="text-sm text-gray-400">No taboo topics yet.</p>
        )}
      </div>

      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Taboo Topic</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Topic *</FieldLabel>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-40"
              placeholder="e.g. Politics"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Reason (optional)</FieldLabel>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-56"
              placeholder="e.g. Legally sensitive"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding} className="bg-orange-500 border-orange-500 hover:bg-orange-600 hover:border-orange-600">
            {adding ? 'Adding…' : 'Add Topic'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ── Goals Tab ──────────────────────────────────────────────────────────────────

function GoalsTab({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/goals`
  const [items, setItems] = useState<Goal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [type, setType] = useState<Goal['type']>('SUBSCRIBERS')
  const [targetValue, setTargetValue] = useState('')
  const [deadline, setDeadline] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    setIsLoading(true)
    apiFetch(base)
      .then((r) => r.json())
      .then((d: Goal[]) => setItems(d))
      .catch(() => setError('Failed to load goals'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          type,
          targetValue: targetValue ? parseFloat(targetValue) : undefined,
          deadline: deadline || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setTargetValue('')
      setDeadline('')
      load()
    } catch {
      setError('Failed to add goal')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((t) => t.id !== id))
    } catch {
      setError('Failed to delete')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Track workspace goals such as subscriber targets, sales, engagement, or reach.
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>Loading…</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <Badge color="indigo">{item.type}</Badge>
                {item.targetValue != null && (
                  <span className="text-sm text-gray-600 ml-2">Target: {item.targetValue}</span>
                )}
                {item.currentValue != null && (
                  <span className="text-sm text-gray-400 ml-2">Current: {item.currentValue}</span>
                )}
                {item.deadline && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Deadline: {new Date(item.deadline).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                Delete
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title="No goals set" description="Add workspace goals below." icon="🎯" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">Add Goal</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>Type *</FieldLabel>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as Goal['type'])}
            >
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Target Value</FieldLabel>
            <Input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-32"
              placeholder="e.g. 10000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Deadline</FieldLabel>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-40"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? 'Adding…' : 'Add Goal'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
