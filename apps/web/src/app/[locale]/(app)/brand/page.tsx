'use client'

import { useEffect, useState } from 'react'
import { useWorkspace } from '@/lib/workspace'
import { useApiFetch } from '@/lib/api'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('brand')
  const apiFetch = useApiFetch()

  const { activeId: workspaceId, status } = useWorkspace()
  const workspaceError = status === 'no-workspaces' ? 'no-workspaces' : status === 'fetch-failed' ? 'fetch-failed' : null
  const [activeTab, setActiveTab] = useState<TabName>('Voice & Tone')

  const TAB_LABELS: Record<TabName, string> = {
    'Voice & Tone': t('tabVoice'),
    'Pillars': t('tabPillars'),
    'Vocabulary': t('tabVocabulary'),
    'Personas': t('tabPersonas'),
    'Visual Identity': t('tabVisual'),
    'Competitors': t('tabCompetitors'),
    'Golden Examples': t('tabGoldenExamples'),
    'Anti-Examples': t('tabAntiExamples'),
    'Taboo Topics': t('tabTaboo'),
    'Goals': t('tabGoals'),
  }

  // Brand preview modal state
  const [showPreview, setShowPreview] = useState(false)
  const [previews, setPreviews] = useState<BrandPreviewItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErrorMsg, setPreviewErrorMsg] = useState('')

  async function handlePreviewBrandVoice() {
    if (!workspaceId) return
    setPreviewLoading(true)
    setPreviewErrorMsg('')
    setPreviews([])
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/brand-preview`, { method: 'POST' })
      if (!r.ok) throw new Error('Failed')
      const data = await r.json() as BrandPreviewItem[]
      setPreviews(data)
      setShowPreview(true)
    } catch {
      setPreviewErrorMsg(t('previewError'))
    } finally {
      setPreviewLoading(false)
    }
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{t('noWorkspace')}</p>
      </div>
    )
  }

  if (workspaceError === 'fetch-failed') {
    return (
      <div className="p-6">
        <ErrorBanner message={t('workspaceFailed')} />
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <div className="p-6 flex items-center gap-3 text-sm text-gray-600">
        <Spinner />
        <span>{t('loading')}</span>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <div className="flex items-center gap-3">
          {previewErrorMsg && <ErrorBanner message={previewErrorMsg} />}
          <Button
            variant="primary"
            onClick={handlePreviewBrandVoice}
            loading={previewLoading}
            className="bg-purple-600 border-purple-600 hover:bg-purple-700 hover:border-purple-700"
          >
            {previewLoading ? t('generating') : t('previewVoice')}
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
            {TAB_LABELS[tab]}
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
              <h2 className="text-lg font-semibold text-gray-900">{t('previewModalTitle')}</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {t('previewModalDesc')}
            </p>
            <div className="flex flex-col gap-4">
              {previews.map((item, i) => (
                <Card key={i}>
                  <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                    {t('previewSample')} {i + 1}
                  </p>
                  <p className="font-semibold text-sm text-gray-900 mb-1">{t('previewHook')}: {item.hook}</p>
                  <p className="text-sm text-gray-600 mb-1">{item.body}</p>
                  <p className="text-sm text-indigo-600 mb-1">{t('previewCta')}: {item.cta}</p>
                  <p className="text-xs text-gray-400">{t('previewCaption')}: {item.caption}</p>
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('tonesLoadError')))
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
      setError(t('toneAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                    {t('examplesDisplay')}: {item.examples.join(', ')}
                  </p>
                )}
                {item.adjectives && item.adjectives.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('adjectivesDisplay')}: {item.adjectives.join(', ')}
                  </p>
                )}
                {item.values && item.values.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('valuesDisplay')}: {item.values.join(', ')}
                  </p>
                )}
                {item.manifesto && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                    {t('manifestoDisplay')}: {item.manifesto}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noTones')} description={t('noTonesDesc')} icon="🎙️" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addTone')}</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('nameLabel')} *</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-40"
                placeholder={t('toneNamePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('descriptionLabel')}</FieldLabel>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-48"
                placeholder={t('optionalPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('examplesLabel')}</FieldLabel>
              <Input
                value={examples}
                onChange={(e) => setExamples(e.target.value)}
                className="w-56"
                placeholder={t('examplesPlaceholder')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('adjectivesLabel')}</FieldLabel>
              <Input
                value={adjectives}
                onChange={(e) => setAdjectives(e.target.value)}
                className="w-56"
                placeholder={t('adjectivesPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('valuesLabel')}</FieldLabel>
              <Input
                value={values}
                onChange={(e) => setValues(e.target.value)}
                className="w-56"
                placeholder={t('valuesPlaceholder')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <FieldLabel>{t('positiveExamplesLabel')}</FieldLabel>
              <textarea
                value={examplesPositive}
                onChange={(e) => setExamplesPositive(e.target.value)}
                className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder={t('positiveExamplesPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <FieldLabel>{t('negativeExamplesLabel')}</FieldLabel>
              <textarea
                value={examplesNegative}
                onChange={(e) => setExamplesNegative(e.target.value)}
                className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder={t('negativeExamplesPlaceholder')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('manifestoLabel')}</FieldLabel>
            <textarea
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              className="w-full h-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder={t('manifestoPlaceholder')}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" loading={adding}>
              {adding ? t('addingTone') : t('addToneButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('pillarsLoadError')))
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
      setError(t('pillarAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                    {t('keywordsDisplay')}: {item.keywords.join(', ')}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noPillars')} description={t('noPillarsDesc')} icon="🏛️" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addPillar')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('nameLabel')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder={t('pillarNamePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('descriptionLabel')}</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-48"
              placeholder={t('optionalPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('keywordsLabel')}</FieldLabel>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-56"
              placeholder={t('keywordsPlaceholder')}
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('vocabularyLoadError')))
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
      setError(t('wordAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noVocabulary')} description={t('noVocabularyDesc')} icon="📖" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addWord')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('wordLabel')} *</FieldLabel>
            <Input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-40"
              placeholder={t('wordPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('typeLabel')}</FieldLabel>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as 'ALLOW' | 'FORBID')}
            >
              <option value="ALLOW">ALLOW</option>
              <option value="FORBID">FORBID</option>
            </Select>
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('personasLoadError')))
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
      setError(t('personaAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                    {t('painPointsDisplay')}: {item.painPoints.join(', ')}
                  </p>
                )}
                {item.desires && item.desires.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('desiresDisplay')}: {item.desires.join(', ')}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noPersonas')} description={t('noPersonasDesc')} icon="👤" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addPersona')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('nameLabel')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder={t('personaNamePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('descriptionLabel')}</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-48"
              placeholder={t('optionalPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('painPointsLabel')}</FieldLabel>
            <Input
              value={painPoints}
              onChange={(e) => setPainPoints(e.target.value)}
              className="w-56"
              placeholder={t('painPointsPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('desiresLabel')}</FieldLabel>
            <Input
              value={desires}
              onChange={(e) => setDesires(e.target.value)}
              className="w-56"
              placeholder={t('desiresPlaceholder')}
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('visualLoadError')))
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
      setError(t('visualSaveError'))
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Spinner />
        <span>{t('loading')}</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg">
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {t('saved')}
        </div>
      )}

      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide text-xs">{t('colorsFontsSection')}</p>
        <div className="flex flex-col gap-3">
          {(
            [
              ['primaryColor', t('primaryColor')],
              ['secondaryColor', t('secondaryColor')],
              ['accentColor', t('accentColor')],
              ['fontPrimary', t('fontPrimary')],
              ['fontSecondary', t('fontSecondary')],
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
        <p className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide text-xs">{t('logoVariantsSection')}</p>
        <div className="flex flex-col gap-3">
          {(
            [
              ['logoUrl', t('logoDefault')],
              ['logoFullUrl', t('logoFull')],
              ['logoIconUrl', t('logoIcon')],
              ['logoLightUrl', t('logoLight')],
              ['logoDarkUrl', t('logoDark')],
              ['watermarkUrl', t('watermark')],
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
          {saving ? t('saving') : t('save')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('competitorsLoadError')))
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
      setError(t('competitorAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noCompetitors')} description={t('noCompetitorsDesc')} icon="🏁" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addCompetitor')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('nameLabel')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
              placeholder={t('competitorNamePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('urlLabel')}</FieldLabel>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-48"
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('notesLabel')}</FieldLabel>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-56"
              placeholder={t('optionalPlaceholder')}
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('goldenExamplesLoadError')))
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
      setError(t('goldenExampleAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noGoldenExamples')} description={t('noGoldenExamplesDesc')} icon="⭐" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addGoldenExample')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('titleLabel')} *</FieldLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-40"
              placeholder={t('goldenTitlePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('contentLabel')} *</FieldLabel>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-56"
              placeholder={t('goldenContentPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('formatLabel')}</FieldLabel>
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
            <FieldLabel>{t('platformLabel')} *</FieldLabel>
            <Input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-32"
              placeholder={t('platformNamePlaceholder')}
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addButton')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('antiExamplesLoadError')))
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
      setError(t('antiExampleAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        {t('antiExamplesDesc')}
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
                  <p className="text-xs text-orange-600 mt-0.5">{t('reasonDisplay')}: {item.reason}</p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noAntiExamples')} description={t('noAntiExamplesDesc')} icon="🚫" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addAntiExample')}</p>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('titleLabel')} *</FieldLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              className="w-40"
              placeholder={t('antiTitlePlaceholder')}
            />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel>{t('formatLabel')}</FieldLabel>
              <Input
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              className="w-32"
              placeholder={t('formatPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('platformLabel')}</FieldLabel>
            <Input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-32"
              placeholder={t('platformNamePlaceholder')}
            />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('contentLabel')} *</FieldLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-16 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder={t('contentPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('reasonLabel')}</FieldLabel>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full"
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          <div>
            <Button type="submit" variant="danger" loading={adding}>
              {adding ? t('adding') : t('addAntiExample')}
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
  const t = useTranslations('brand')
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
      .catch(() => setError(t('tabooLoadError')))
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
      setError(t('tabooAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        {t('tabooDesc')}
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
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
          <p className="text-sm text-gray-400">{t('noTabooTopics')}</p>
        )}
      </div>

      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addTabooTopic')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('topicLabel')} *</FieldLabel>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-40"
              placeholder={t('topicPlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('reasonOptional')}</FieldLabel>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-56"
              placeholder={t('tabooReasonPlaceholder')}
            />
          </div>
          <Button type="submit" variant="primary" loading={adding} className="bg-orange-500 border-orange-500 hover:bg-orange-600 hover:border-orange-600">
            {adding ? t('adding') : t('addTabooTopic')}
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
  const t = useTranslations('brand')
  const GOAL_TYPE_LABELS: Record<Goal['type'], string> = {
    SUBSCRIBERS: t('goalSubscribers'),
    SALES: t('goalSales'),
    ENGAGEMENT: t('goalEngagement'),
    REACH: t('goalReach'),
  }
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
      .catch(() => setError(t('goalsLoadError')))
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
      setError(t('goalAddError'))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setError(t('deleteError'))
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        {t('goalsDesc')}
      </p>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
          <Spinner />
          <span>{t('loading')}</span>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <ul className="mb-6 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-start justify-between">
              <div>
                <Badge color="indigo">{GOAL_TYPE_LABELS[item.type] ?? item.type}</Badge>
                {item.targetValue != null && (
                  <span className="text-sm text-gray-600 ml-2">{t('goalTarget')}: {item.targetValue}</span>
                )}
                {item.currentValue != null && (
                  <span className="text-sm text-gray-400 ml-2">{t('goalCurrent')}: {item.currentValue}</span>
                )}
                {item.deadline && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('goalDeadline')}: {new Date(item.deadline).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
                className="ml-4 shrink-0"
              >
                {t('delete')}
              </Button>
            </Card>
          </li>
        ))}
        {!isLoading && items.length === 0 && (
          <EmptyState title={t('noGoals')} description={t('noGoalsDesc')} icon="🎯" />
        )}
      </ul>
      <Card>
        <p className="text-sm font-semibold text-gray-700 mb-4">{t('addGoal')}</p>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('goalTypeLabel')} *</FieldLabel>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as Goal['type'])}
            >
              {GOAL_TYPES.map((goalType) => (
                <option key={goalType} value={goalType}>
                  {GOAL_TYPE_LABELS[goalType]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('targetValueLabel')}</FieldLabel>
            <Input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-32"
              placeholder="e.g. 10000"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{t('deadlineLabel')}</FieldLabel>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-40"
            />
          </div>
          <Button type="submit" variant="primary" loading={adding}>
            {adding ? t('adding') : t('addGoal')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
