'use client'

import { useAuth } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BrandCard } from '@contento/brand-kit'
import { VideoJobPanel } from './_components/VideoJobPanel'
import { useWorkspace } from '@/lib/workspace'
import {
  Button,
  Card,
  Badge,
  StatusBadge,
  Spinner,
  Input,
  Select,
  EmptyState,
  ErrorBanner,
} from '@/components/ui/index'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Workspace {
  id: string
  name: string
}

interface Idea {
  id: string
  title: string
  angle?: string
  format?: string
  platform?: string
}

interface Script {
  id: string
  hook?: string
  body?: string
  cta?: string
  caption?: string
  hashtags?: string[]
}

interface CriterionResult {
  score: number
  passed: boolean
  issues: string[]
  suggestions: string[]
}

interface BrandCheckResult {
  overallScore: number
  passed: boolean
  summary: string
  criteria: {
    tone: CriterionResult
    vocabulary: CriterionResult
    pillar: CriterionResult
    persona: CriterionResult
    visual: CriterionResult
    legal: CriterionResult
  }
  autoFixes?: {
    hook?: string
    body?: string
    cta?: string
    caption?: string
  } | null
}

interface Hook {
  id: string
  text: string
  format?: string | null
  source?: string
  performanceScore?: number | null
  publicationCount?: number
  lastSeenAt?: string | null
}

interface VisualIdentity {
  primaryColor?: string | null
  secondaryColor?: string | null
  accentColor?: string | null
  fontPrimary?: string | null
  logoUrl?: string | null
  watermarkUrl?: string | null
}

interface SocialAccount {
  id: string
  platform: string
  name: string
}

interface Publication {
  id: string
  status: string
  socialAccountId: string
}

type PageTab = 'New Content' | 'Hooks Library'

// ── Stepper ────────────────────────────────────────────────────────────────────

const STEP_KEYS: Record<1 | 2 | 3 | 4, 'stepChooseTopic' | 'stepPickIdea' | 'stepReviewScript' | 'stepApprove'> = {
  1: 'stepChooseTopic',
  2: 'stepPickIdea',
  3: 'stepReviewScript',
  4: 'stepApprove',
}

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const tCreate = useTranslations('create')
  const steps = [1, 2, 3, 4] as const
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, idx) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                s === step
                  ? 'bg-indigo-600 text-white'
                  : s < step
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-400',
              ].join(' ')}
            >
              {s < step ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            <span
              className={[
                'text-xs mt-1.5 whitespace-nowrap font-medium',
                s === step ? 'text-indigo-600' : s < step ? 'text-indigo-400' : 'text-gray-400',
              ].join(' ')}
            >
              {tCreate(STEP_KEYS[s])}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={[
                'h-px w-16 mb-5 mx-2',
                s < step ? 'bg-indigo-300' : 'bg-gray-200',
              ].join(' ')}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const { getToken } = useAuth()
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const tCreatePage = useTranslations('create')
  const { activeId: workspaceId, status: workspaceStatus } = useWorkspace()
  const workspaceError = workspaceStatus === 'no-workspaces' ? 'no-workspaces'
    : workspaceStatus === 'fetch-failed' ? 'fetch-failed'
    : null
  const [visualIdentity, setVisualIdentity] = useState<VisualIdentity | null>(null)

  const [pageTab, setPageTab] = useState<PageTab>('New Content')

  // Stepper state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [trendId, setTrendId] = useState<string | null>(null)
  const [ideaId, setIdeaId] = useState<string | null>(null)
  const [scriptId, setScriptId] = useState<string | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [brandCheck, setBrandCheck] = useState<BrandCheckResult | null>(null)

  // Render state
  const [renderJobId, setRenderJobId] = useState<string | null>(null)
  const [renderJobStatus, setRenderJobStatus] = useState<string | null>(null)
  const [renderOutputUrl, setRenderOutputUrl] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)

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

  useEffect(() => {
    if (!workspaceId) return
    apiFetch(`/workspaces/${workspaceId}/brand/visual-identity`)
      .then((r) => r.json())
      .then((data: VisualIdentity) => setVisualIdentity(data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function resetAll() {
    setStep(1)
    setTrendId(null)
    setIdeaId(null)
    setScriptId(null)
    setScript(null)
    setBrandCheck(null)
    setRenderJobId(null)
    setRenderJobStatus(null)
    setRenderOutputUrl(null)
    setIsRendering(false)
  }

  if (workspaceError === 'no-workspaces') {
    return (
      <div className="p-6">
        <EmptyState title="No workspace found" description="Create a workspace first." icon="🏢" />
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
      <div className="p-6 flex items-center gap-2 text-gray-400 text-sm">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">{tCreatePage('title')}</h1>

      {/* Top-level tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {(['New Content', 'Hooks Library'] as PageTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setPageTab(tab)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors',
              pageTab === tab
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-800 border-b-2 border-transparent',
            ].join(' ')}
          >
            {tab === 'New Content' ? tCreatePage('tabNew') : tCreatePage('tabHooks')}
          </button>
        ))}
      </div>

      {pageTab === 'New Content' && (
        <div>
          <StepIndicator step={step} />

          {step === 1 && (
            <Step1EnterTrend
              workspaceId={workspaceId}
              apiFetch={apiFetch}
              onSuccess={(id) => {
                setTrendId(id)
                setStep(2)
              }}
            />
          )}

          {step === 2 && trendId && (
            <Step2PickIdea
              workspaceId={workspaceId}
              trendId={trendId}
              apiFetch={apiFetch}
              onBack={() => setStep(1)}
              onSuccess={(id) => {
                setIdeaId(id)
                setStep(3)
              }}
            />
          )}

          {step === 3 && ideaId && (
            <Step3ReviewScript
              workspaceId={workspaceId}
              ideaId={ideaId}
              apiFetch={apiFetch}
              onBack={() => setStep(2)}
              onScript={(sid, s) => {
                setScriptId(sid)
                setScript(s)
              }}
              onBrandCheck={(result) => setBrandCheck(result)}
              scriptId={scriptId}
              script={script}
              brandCheck={brandCheck}
              onApprove={() => setStep(4)}
              visualIdentity={visualIdentity}
              renderJobId={renderJobId}
              renderJobStatus={renderJobStatus}
              renderOutputUrl={renderOutputUrl}
              isRendering={isRendering}
              onRenderJobId={setRenderJobId}
              onRenderJobStatus={setRenderJobStatus}
              onRenderOutputUrl={setRenderOutputUrl}
              onIsRendering={setIsRendering}
              onApplyAutoFixes={(fixes) => {
                setBrandCheck(null)
                setScript((prev) => (prev ? { ...prev, ...fixes } : prev))
              }}
            />
          )}

          {step === 4 && scriptId && (
            <Step4Approve
              workspaceId={workspaceId}
              scriptId={scriptId}
              apiFetch={apiFetch}
              onStartOver={resetAll}
              script={script}
              visualIdentity={visualIdentity}
              renderOutputUrl={renderOutputUrl}
              renderJobId={renderJobId}
            />
          )}
        </div>
      )}

      {pageTab === 'Hooks Library' && (
        <HooksLibrary workspaceId={workspaceId} apiFetch={apiFetch} />
      )}
    </div>
  )
}

// ── Shared type ────────────────────────────────────────────────────────────────

type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

// ── Step 1: Enter Trend ────────────────────────────────────────────────────────

function Step1EnterTrend({
  workspaceId,
  apiFetch,
  onSuccess,
}: {
  workspaceId: string
  apiFetch: ApiFetch
  onSuccess: (trendId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/trends`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          url: url.trim() || undefined,
          source: 'adhoc',
        }),
      })
      if (!r.ok) throw new Error('Failed to create trend')
      const data = await r.json() as { id: string }
      onSuccess(data.id)
    } catch {
      setError('Failed to create trend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Choose a Topic</h2>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-gray-700 font-medium">
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. AI tools for creators"
            required
            minLength={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-gray-700 font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            rows={3}
            placeholder="Optional description…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-gray-700 font-medium">URL</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            type="url"
          />
        </div>
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || !title.trim()}
          >
            {loading ? 'Creating…' : 'Next: Generate Ideas'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ── Step 2: Generate & Pick Idea ───────────────────────────────────────────────

function Step2PickIdea({
  workspaceId,
  trendId,
  apiFetch,
  onBack,
  onSuccess,
}: {
  workspaceId: string
  trendId: string
  apiFetch: ApiFetch
  onBack: () => void
  onSuccess: (ideaId: string) => void
}) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    apiFetch(`/workspaces/${workspaceId}/trends/${trendId}/ideas`, {
      method: 'POST',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to generate ideas')
        return r.json() as Promise<Idea[]>
      })
      .then((data) => setIdeas(data))
      .catch(() => setError('Failed to generate ideas. Please go back and try again.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendId])

  async function handleSelect(idea: Idea) {
    setSelecting(idea.id)
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/ideas/${idea.id}/select`, {
        method: 'PATCH',
      })
      if (!r.ok) throw new Error('Failed to select idea')
      onSuccess(idea.id)
    } catch {
      setError('Failed to select idea. Please try again.')
      setSelecting(null)
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Pick an Idea</h2>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm mb-4">
          <Spinner />
          <span>Generating ideas…</span>
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {!loading && ideas.length > 0 && (
        <ul className="flex flex-col gap-3 mb-6">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Card
                className={[
                  'cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all',
                  selecting === idea.id ? 'opacity-70' : '',
                ].join(' ')}
                onClick={() => !selecting && handleSelect(idea)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{idea.title}</p>
                    {idea.angle && (
                      <p className="text-gray-500 text-xs mt-1">{idea.angle}</p>
                    )}
                    <div className="flex gap-1.5 mt-2.5 flex-wrap">
                      {idea.format && <Badge color="indigo">{idea.format}</Badge>}
                      {idea.platform && <Badge color="blue">{idea.platform}</Badge>}
                    </div>
                  </div>
                  {selecting === idea.id && (
                    <div className="shrink-0 mt-1">
                      <Spinner />
                    </div>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={onBack} disabled={!!selecting}>
        ← Back
      </Button>
    </div>
  )
}

// ── CriteriaTable ──────────────────────────────────────────────────────────────

function CriteriaTable({ criteria }: { criteria: BrandCheckResult['criteria'] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!criteria) return null
  const rows = Object.entries(criteria) as [string, CriterionResult][]
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mt-2">
      {rows.map(([name, c]) => (
        <div key={name} className="border-b border-gray-200 last:border-0">
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === name ? null : name)}
          >
            <span className="text-sm capitalize w-24 flex-shrink-0 font-medium text-gray-700">{name}</span>
            <span
              className={[
                'text-xs font-semibold px-2 py-0.5 rounded-md',
                c.score >= 70
                  ? 'bg-green-50 text-green-700'
                  : c.score >= 50
                    ? 'bg-yellow-50 text-yellow-700'
                    : 'bg-red-50 text-red-700',
              ].join(' ')}
            >
              {c.score}/100
            </span>
            <span className={`text-xs font-medium ${c.passed ? 'text-green-600' : 'text-red-500'}`}>
              {c.passed ? '✓ Pass' : '✗ Fail'}
            </span>
            <span className="ml-auto text-gray-400 text-xs">
              {expanded === name ? '▲' : '▼'}
            </span>
          </button>
          {expanded === name && (
            <div className="px-4 pb-3 bg-gray-50 text-xs text-gray-600 flex flex-col gap-2">
              {c.issues.length > 0 && (
                <div>
                  <p className="font-semibold mb-1 text-red-600">Issues:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-0.5">
                    {c.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {c.suggestions.length > 0 && (
                <div>
                  <p className="font-semibold mb-1 text-indigo-600">Suggestions:</p>
                  <ul className="list-disc pl-4 flex flex-col gap-0.5">
                    {c.suggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Template picker data ───────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'SingleImagePost', label: 'Single Image', format: 'Square' },
  { id: 'QuotePost',       label: 'Quote Card',   format: 'Square' },
  { id: 'NewsCard',        label: 'News Card',    format: 'Portrait' },
  { id: 'CarouselPost',    label: 'Carousel',     format: 'Square' },
  { id: 'StoryPost',       label: 'Story',        format: '9:16' },
]

// ── Step 3: Generate & Review Script ──────────────────────────────────────────

function Step3ReviewScript({
  workspaceId,
  ideaId,
  apiFetch,
  onBack,
  onScript,
  onBrandCheck,
  scriptId,
  script,
  brandCheck,
  onApprove,
  visualIdentity,
  renderJobId,
  renderOutputUrl,
  isRendering,
  onRenderJobId,
  onRenderJobStatus,
  onRenderOutputUrl,
  onIsRendering,
  onApplyAutoFixes,
}: {
  workspaceId: string
  ideaId: string
  apiFetch: ApiFetch
  onBack: () => void
  onScript: (scriptId: string, script: Script) => void
  onBrandCheck: (result: BrandCheckResult) => void
  scriptId: string | null
  script: Script | null
  brandCheck: BrandCheckResult | null
  onApprove: () => void
  visualIdentity: VisualIdentity | null
  renderJobId: string | null
  renderJobStatus: string | null
  renderOutputUrl: string | null
  isRendering: boolean
  onRenderJobId: (id: string | null) => void
  onRenderJobStatus: (status: string | null) => void
  onRenderOutputUrl: (url: string | null) => void
  onIsRendering: (v: boolean) => void
  onApplyAutoFixes: (fixes: { hook?: string; body?: string; cta?: string; caption?: string }) => void
}) {
  const [generating, setGenerating] = useState(!script)
  const [error, setError] = useState('')
  const [brandChecking, setBrandChecking] = useState(false)
  const [brandCheckError, setBrandCheckError] = useState('')
  const [renderJobError, setRenderJobError] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('SingleImagePost')

  useEffect(() => {
    if (script) return
    setGenerating(true)
    setError('')
    apiFetch(`/workspaces/${workspaceId}/ideas/${ideaId}/script`, {
      method: 'POST',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to generate script')
        return r.json() as Promise<Script>
      })
      .then((data) => {
        onScript(data.id, data)
      })
      .catch(() => setError('Failed to generate script. Please go back and try again.'))
      .finally(() => setGenerating(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId])

  // Polling for render job
  useEffect(() => {
    if (!isRendering || !renderJobId || !workspaceId || !scriptId) return
    const poll = setInterval(async () => {
      const r = await apiFetch(`/workspaces/${workspaceId}/scripts/${scriptId}/render-job`)
      if (!r.ok) {
        clearInterval(poll)
        onIsRendering(false)
        return
      }
      const job = await r.json() as { status: string; outputUrl: string | null }
      onRenderJobStatus(job.status)
      if (job.status === 'DONE') {
        clearInterval(poll)
        onIsRendering(false)
        onRenderOutputUrl(job.outputUrl)
      } else if (job.status === 'FAILED') {
        clearInterval(poll)
        onIsRendering(false)
        setRenderJobError('Render failed. Try again.')
      }
    }, 2000)
    return () => clearInterval(poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRendering, renderJobId, workspaceId, scriptId])

  async function handleBrandCheck() {
    if (!scriptId) return
    setBrandChecking(true)
    setBrandCheckError('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/brand-check`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error('Failed to run brand check')
      const data = await r.json() as BrandCheckResult
      onBrandCheck(data)
    } catch {
      setBrandCheckError('Failed to run brand check. Please try again.')
    } finally {
      setBrandChecking(false)
    }
  }

  async function handleGenerateVisual() {
    if (!scriptId) return
    setRenderJobError('')
    onRenderOutputUrl(null)
    onRenderJobId(null)
    onRenderJobStatus(null)
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/render`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId: selectedTemplateId }),
        },
      )
      if (!r.ok) throw new Error('Failed to start render')
      const data = await r.json() as { id: string }
      onRenderJobId(data.id)
      onIsRendering(true)
    } catch {
      setRenderJobError('Failed to start render. Try again.')
    }
  }

  const brandApproved = brandCheck !== null && brandCheck.overallScore >= 70

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Review Script</h2>

      {generating && (
        <div className="flex items-center gap-3 text-gray-500 text-sm mb-4">
          <Spinner />
          <span>Generating script…</span>
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {!generating && script && (
        <div className="flex flex-col gap-5 mb-6">
          {/* Hook */}
          {script.hook && (
            <Card className="bg-indigo-50 border-indigo-100">
              <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-1.5">
                Hook
              </p>
              <p className="text-lg font-medium text-gray-900">{script.hook}</p>
            </Card>
          )}

          {/* Body */}
          {script.body && (
            <Card>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Body
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{script.body}</p>
            </Card>
          )}

          {/* CTA */}
          {script.cta && (
            <Card>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                CTA
              </p>
              <p className="text-sm text-gray-700 italic">{script.cta}</p>
            </Card>
          )}

          {/* Caption */}
          {script.caption && (
            <Card>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Caption
              </p>
              <p className="text-sm text-gray-700">{script.caption}</p>
            </Card>
          )}

          {/* Hashtags */}
          {script.hashtags && script.hashtags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Hashtags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {script.hashtags.map((tag) => (
                  <Badge key={tag} color="indigo">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Template Picker */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Template
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  className={[
                    'flex-shrink-0 flex flex-col items-center border rounded-lg px-3 py-2 text-xs transition-all',
                    selectedTemplateId === tpl.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white',
                  ].join(' ')}
                >
                  <span className="font-semibold">{tpl.label}</span>
                  <span
                    className={[
                      'mt-0.5 px-1.5 py-0.5 rounded text-xs',
                      selectedTemplateId === tpl.id
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-400',
                    ].join(' ')}
                  >
                    {tpl.format}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Visual Preview */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Visual Preview
            </p>
            <div style={{ width: 400, height: 400, overflow: 'hidden' }}>
              {renderOutputUrl ? (
                <img src={renderOutputUrl} alt="Rendered visual" style={{ width: 400 }} />
              ) : (
                <BrandCard
                  hook={script.hook ?? ''}
                  caption={script.caption ?? ''}
                  hashtags={script.hashtags ?? []}
                  primaryColor={visualIdentity?.primaryColor ?? undefined}
                  secondaryColor={visualIdentity?.secondaryColor ?? undefined}
                  accentColor={visualIdentity?.accentColor ?? undefined}
                  fontPrimary={visualIdentity?.fontPrimary ?? undefined}
                  logoUrl={visualIdentity?.logoUrl ?? undefined}
                  watermarkUrl={visualIdentity?.watermarkUrl ?? undefined}
                />
              )}
            </div>

            {/* Generate Visual button */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {isRendering ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Spinner />
                  <span>Generating…</span>
                </div>
              ) : (
                <Button variant="secondary" onClick={handleGenerateVisual} disabled={!scriptId}>
                  {renderOutputUrl ? 'Regenerate' : 'Generate Visual'}
                </Button>
              )}
              {renderJobError && <ErrorBanner message={renderJobError} />}
            </div>
          </div>

          {/* Video Generation */}
          {scriptId && (
            <VideoJobPanel
              workspaceId={workspaceId}
              scriptId={scriptId}
              apiFetch={apiFetch}
            />
          )}

          {/* Brand Check Result */}
          {brandCheck !== null && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={[
                    'text-sm font-semibold px-2.5 py-0.5 rounded-lg',
                    brandCheck.overallScore >= 70
                      ? 'bg-green-50 text-green-700'
                      : brandCheck.overallScore >= 50
                        ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  {brandCheck.overallScore}/100
                </span>
                {brandApproved ? (
                  <span className="text-green-600 text-sm font-medium">✓ Brand approved</span>
                ) : (
                  <span className="text-yellow-600 text-sm font-medium">⚠ Needs revision</span>
                )}
              </div>

              {brandCheck.summary && (
                <p className="text-xs text-gray-500 mb-2">{brandCheck.summary}</p>
              )}

              <CriteriaTable criteria={brandCheck.criteria} />

              {brandCheck.autoFixes &&
                Object.keys(brandCheck.autoFixes).length > 0 && (
                  <div className="mt-3 border border-indigo-200 rounded-lg p-3 bg-indigo-50 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-indigo-700">
                      Auto-fix suggestions available
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (brandCheck.autoFixes) {
                          onApplyAutoFixes(brandCheck.autoFixes)
                        }
                      }}
                    >
                      Apply Fixes
                    </Button>
                  </div>
                )}
            </Card>
          )}

          {brandCheckError && <ErrorBanner message={brandCheckError} />}

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={handleBrandCheck} loading={brandChecking} disabled={brandChecking}>
              {brandChecking ? 'Checking…' : 'Check Brand'}
            </Button>
            <Button
              variant="primary"
              onClick={onApprove}
              disabled={!brandApproved}
            >
              Approve Script
            </Button>
          </div>
        </div>
      )}

      <Button variant="ghost" onClick={onBack} disabled={generating}>
        ← Back
      </Button>
    </div>
  )
}

// ── Step 4: Approve ────────────────────────────────────────────────────────────

type ScriptStatus =
  | 'DRAFT'
  | 'BRAND_CHECKED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'

type PublishMode = 'now' | 'schedule'

function defaultScheduleAt(): string {
  // datetime-local input expects YYYY-MM-DDTHH:mm in local time
  const d = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

function Step4Approve({
  workspaceId,
  scriptId,
  apiFetch,
  onStartOver,
  script,
  visualIdentity,
  renderOutputUrl,
  renderJobId,
}: {
  workspaceId: string
  scriptId: string
  apiFetch: ApiFetch
  onStartOver: () => void
  script: Script | null
  visualIdentity: VisualIdentity | null
  renderOutputUrl: string | null
  renderJobId: string | null
}) {
  const tCreate = useTranslations('create')

  const [currentStatus, setCurrentStatus] = useState<ScriptStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [actionLoading, setActionLoading] = useState<
    null | 'submit' | 'approve' | 'publish' | 'schedule'
  >(null)
  const [actionError, setActionError] = useState('')
  const [actionInfo, setActionInfo] = useState('')

  const [mode, setMode] = useState<PublishMode | null>(null)
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduleAt())
  const [publications, setPublications] = useState<Publication[]>([])
  const [pollActive, setPollActive] = useState(false)

  // Load current script status
  useEffect(() => {
    let cancelled = false
    setStatusLoading(true)
    apiFetch(`/workspaces/${workspaceId}/scripts/${scriptId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ status?: ScriptStatus }>
      })
      .then((s) => {
        if (!cancelled) setCurrentStatus(s.status ?? 'DRAFT')
      })
      .catch(() => {
        if (!cancelled) setCurrentStatus('DRAFT')
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, scriptId])

  // Load social accounts when entering publish/schedule mode
  useEffect(() => {
    if (mode !== 'now' && mode !== 'schedule') return
    if (socialAccounts.length > 0) return
    setAccountsLoading(true)
    apiFetch(`/workspaces/${workspaceId}/social-accounts`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load accounts')
        return r.json() as Promise<SocialAccount[]>
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setSocialAccounts(list)
        if (list.length > 0 && !selectedAccountId) {
          setSelectedAccountId(list[0]!.id)
        }
      })
      .catch(() => setActionError(tCreate('publishError')))
      .finally(() => setAccountsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, workspaceId])

  // Poll publications until terminal
  useEffect(() => {
    if (!pollActive) return
    let elapsed = 0
    const interval = setInterval(async () => {
      elapsed += 3
      try {
        const r = await apiFetch(
          `/workspaces/${workspaceId}/scripts/${scriptId}/publications`,
        )
        if (!r.ok) return
        const data = (await r.json()) as Publication[]
        if (Array.isArray(data)) {
          setPublications(data)
          const allDone = data.every(
            (p) => p.status === 'PUBLISHED' || p.status === 'FAILED',
          )
          if (allDone || elapsed >= 120) {
            clearInterval(interval)
            setPollActive(false)
          }
        }
      } catch {
        // ignore
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollActive])

  async function handleSubmitForReview() {
    setActionLoading('submit')
    setActionError('')
    setActionInfo('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/submit-review`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const s = (await r.json()) as { status?: ScriptStatus }
      setCurrentStatus(s.status ?? 'IN_REVIEW')
      setActionInfo(tCreate('submitForReviewSuccess'))
    } catch {
      setActionError(tCreate('submitForReviewError'))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleApprove() {
    setActionLoading('approve')
    setActionError('')
    setActionInfo('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/approve`,
        { method: 'POST' },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const s = (await r.json()) as { status?: ScriptStatus }
      setCurrentStatus(s.status ?? 'APPROVED')
      setActionInfo(tCreate('approveSuccess'))
    } catch {
      setActionError(tCreate('approveError'))
    } finally {
      setActionLoading(null)
    }
  }

  async function postPublication(opts: { scheduledAt?: string }) {
    if (!selectedAccountId) return
    const isSchedule = Boolean(opts.scheduledAt)
    setActionLoading(isSchedule ? 'schedule' : 'publish')
    setActionError('')
    setActionInfo('')
    try {
      const r = await apiFetch(
        `/workspaces/${workspaceId}/scripts/${scriptId}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({
            socialAccountId: selectedAccountId,
            ...(renderJobId ? { renderJobId } : {}),
            ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
          }),
        },
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const pub = (await r.json()) as Publication
      setPublications([pub])
      if (isSchedule) {
        setActionInfo(tCreate('scheduleSuccess'))
      } else {
        setPollActive(true)
      }
    } catch {
      setActionError(isSchedule ? tCreate('scheduleError') : tCreate('publishError'))
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePublishNow() {
    await postPublication({})
  }

  async function handleSchedule() {
    if (!scheduledAt) return
    const ts = new Date(scheduledAt)
    if (Number.isNaN(ts.getTime()) || ts.getTime() <= Date.now()) {
      setActionError(tCreate('scheduleMustBeFuture'))
      return
    }
    await postPublication({ scheduledAt: ts.toISOString() })
  }

  const statusLabel = (s: ScriptStatus | null): string => {
    switch (s) {
      case 'DRAFT':
        return tCreate('statusDraft')
      case 'BRAND_CHECKED':
        return tCreate('statusBrandChecked')
      case 'IN_REVIEW':
        return tCreate('statusInReview')
      case 'APPROVED':
        return tCreate('statusApproved')
      case 'REJECTED':
        return tCreate('statusRejected')
      case 'PUBLISHED':
        return tCreate('statusPublished')
      default:
        return '—'
    }
  }

  const canSubmitForReview =
    currentStatus === 'DRAFT' || currentStatus === 'BRAND_CHECKED'
  const canApprove = currentStatus === 'IN_REVIEW'
  const canPublish = currentStatus === 'APPROVED'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">
          {tCreate('approveHeader')}
        </h2>
        {!statusLoading && currentStatus && (
          <StatusBadge status={currentStatus} />
        )}
      </div>

      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} />
        </div>
      )}

      {actionInfo && (
        <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {actionInfo}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual preview */}
        <div className="border rounded-lg p-3 bg-gray-50 flex items-center justify-center">
          <div style={{ width: 360, height: 360, overflow: 'hidden' }}>
            {renderOutputUrl ? (
              <img
                src={renderOutputUrl}
                alt="Rendered visual"
                style={{ width: 360 }}
              />
            ) : script ? (
              <BrandCard
                hook={script.hook ?? ''}
                caption={script.caption ?? ''}
                hashtags={script.hashtags ?? []}
                primaryColor={visualIdentity?.primaryColor ?? undefined}
                secondaryColor={visualIdentity?.secondaryColor ?? undefined}
                accentColor={visualIdentity?.accentColor ?? undefined}
                fontPrimary={visualIdentity?.fontPrimary ?? undefined}
                logoUrl={visualIdentity?.logoUrl ?? undefined}
                watermarkUrl={visualIdentity?.watermarkUrl ?? undefined}
              />
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-4">
          {currentStatus === 'IN_REVIEW' && (
            <Card className="bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-800 mb-2">
                {tCreate('inReviewHint')}
              </p>
              <Link
                href="/review"
                className="text-sm text-amber-700 underline hover:no-underline"
              >
                {tCreate('goToReview')}
              </Link>
            </Card>
          )}

          {canPublish && (
            <p className="text-sm text-emerald-700">
              {tCreate('approvedReadyHint')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              onClick={handleSubmitForReview}
              loading={actionLoading === 'submit'}
              disabled={!canSubmitForReview || actionLoading !== null}
            >
              {actionLoading === 'submit'
                ? tCreate('sendingForReview')
                : tCreate('submitForReview')}
            </Button>

            <Button
              variant="secondary"
              onClick={handleApprove}
              loading={actionLoading === 'approve'}
              disabled={!canApprove || actionLoading !== null}
            >
              {actionLoading === 'approve'
                ? tCreate('approveLoading')
                : tCreate('approveScript')}
            </Button>

            <Button
              variant="primary"
              onClick={() => setMode('now')}
              disabled={!canPublish || actionLoading !== null}
            >
              {tCreate('publishNow')}
            </Button>

            <Button
              variant="secondary"
              onClick={() => setMode('schedule')}
              disabled={!canPublish || actionLoading !== null}
            >
              {tCreate('schedule')}
            </Button>
          </div>

          {/* Publish / Schedule form */}
          {(mode === 'now' || mode === 'schedule') && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  {mode === 'now'
                    ? tCreate('publishHeader')
                    : tCreate('scheduleHeader')}
                </h3>
                <button
                  onClick={() => setMode(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {tCreate('close')}
                </button>
              </div>

              {accountsLoading && (
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                  <Spinner />
                  <span>{tCreate('loadingAccounts')}</span>
                </div>
              )}

              {!accountsLoading && socialAccounts.length === 0 && (
                <p className="text-sm text-gray-500">
                  {tCreate('noAccounts')}{' '}
                  <Link
                    href="/settings/accounts"
                    className="text-indigo-600 hover:underline"
                  >
                    {tCreate('connectAccounts')}
                  </Link>
                </p>
              )}

              {!accountsLoading && socialAccounts.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-gray-500 font-medium">
                      {tCreate('selectAccount')}
                    </label>
                    <Select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full"
                    >
                      {socialAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platform} — {acc.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {mode === 'schedule' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-500 font-medium">
                        {tCreate('scheduleAtLabel')}
                      </label>
                      <Input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  )}

                  <Button
                    variant="primary"
                    onClick={mode === 'now' ? handlePublishNow : handleSchedule}
                    loading={
                      mode === 'now'
                        ? actionLoading === 'publish'
                        : actionLoading === 'schedule'
                    }
                    disabled={
                      actionLoading !== null || !selectedAccountId
                    }
                    className="w-fit"
                  >
                    {mode === 'now'
                      ? actionLoading === 'publish'
                        ? tCreate('publishing')
                        : tCreate('publish')
                      : tCreate('scheduleSubmit')}
                  </Button>
                </div>
              )}

              {publications.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-3">
                  {publications.map((pub) => (
                    <div key={pub.id} className="flex items-center gap-2 text-sm">
                      <StatusBadge status={pub.status} />
                      {(pub.status === 'PENDING' || pub.status === 'PUBLISHING') && (
                        <Spinner />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-2">
            <Link
              href="/calendar"
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
            >
              {tCreate('goCalendar')}
            </Link>
            <Button variant="ghost" onClick={onStartOver}>
              {tCreate('startOver')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hooks Library ──────────────────────────────────────────────────────────────

function HooksLibrary({
  workspaceId,
  apiFetch,
}: {
  workspaceId: string
  apiFetch: ApiFetch
}) {
  const base = `/workspaces/${workspaceId}/hooks`
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hookText, setHookText] = useState('')
  const [hookFormat, setHookFormat] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    apiFetch(base)
      .then((r) => r.json() as Promise<Hook[]>)
      .then((data) => setHooks(data))
      .catch(() => setError('Failed to load hooks'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!hookText.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const r = await apiFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          text: hookText.trim(),
          format: hookFormat.trim() || undefined,
        }),
      })
      if (!r.ok) throw new Error('Failed to save hook')
      setHookText('')
      setHookFormat('')
      load()
    } catch {
      setSaveError('Failed to save hook. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const r = await apiFetch(`${base}/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      setHooks((prev) => prev.filter((h) => h.id !== id))
    } catch {
      setError('Failed to delete hook')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900 mb-5">Hooks Library</h2>

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 text-sm mb-4">
          <Spinner />
          <span>Loading hooks…</span>
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {!loading && hooks.length === 0 && (
        <EmptyState title="No hooks saved yet" description="Add your first hook below." icon="🪝" />
      )}

      <ul className="flex flex-col gap-2 mb-6">
        {hooks.map((hook) => {
          const perf = typeof hook.performanceScore === 'number' ? hook.performanceScore : null
          const perfColor: 'default' | 'green' | 'yellow' | 'red' =
            perf === null
              ? 'default'
              : perf >= 80
              ? 'green'
              : perf >= 50
              ? 'yellow'
              : 'red'
          return (
            <li key={hook.id}>
              <Card className="flex items-start justify-between gap-3" padding={false}>
                <div className="flex-1 p-4">
                  <p className="text-sm text-gray-800">{hook.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {hook.format && <Badge color="indigo">{hook.format}</Badge>}
                    {hook.source && hook.source !== 'manual' && (
                      <Badge color="default">{hook.source}</Badge>
                    )}
                    {perf !== null && (
                      <Badge color={perfColor}>perf {perf.toFixed(1)}</Badge>
                    )}
                    {typeof hook.publicationCount === 'number' &&
                      hook.publicationCount > 0 && (
                        <span className="text-xs text-gray-500">
                          used in {hook.publicationCount} pub{hook.publicationCount === 1 ? '' : 's'}
                        </span>
                      )}
                  </div>
                </div>
                <div className="p-4 pl-0">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(hook.id)}
                    disabled={deletingId === hook.id}
                  >
                    {deletingId === hook.id ? '…' : 'Delete'}
                  </Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Save a Hook</h3>
        {saveError && <div className="mb-3"><ErrorBanner message={saveError} /></div>}
        <form onSubmit={handleSave} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500 font-medium">Hook text *</label>
            <Input
              value={hookText}
              onChange={(e) => setHookText(e.target.value)}
              className="w-64"
              placeholder="e.g. The one thing no one tells you about…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500 font-medium">Format</label>
            <Input
              value={hookFormat}
              onChange={(e) => setHookFormat(e.target.value)}
              className="w-32"
              placeholder="e.g. reel"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={saving || !hookText.trim()}
          >
            {saving ? 'Saving…' : 'Save Hook'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
