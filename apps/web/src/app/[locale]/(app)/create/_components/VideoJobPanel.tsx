'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'
import { QaBadge } from '@/components/qa/QaBadge'
import { API_BASE } from '@/lib/api'

interface VideoShot {
  id: string
  index: number
  prompt: string
  dialogue: string | null
  durationSec: number
  status: 'PENDING' | 'SUBMITTED' | 'DONE' | 'FAILED'
  higgsfieldJobId: string | null
  clipUrl: string | null
  errorMessage: string | null
}

interface QaVerdict {
  status: 'PASS' | 'WARN' | 'BLOCK'
  findings: { id: string; severity: string; message: string }[]
}

interface VideoJob {
  id: string
  status: 'PENDING' | 'STORYBOARDING' | 'RENDERING_SHOTS' | 'STITCHING' | 'DONE' | 'FAILED'
  outputUrl: string | null
  errorMessage: string | null
  shots?: VideoShot[]
  qa?: QaVerdict | null
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

interface Props {
  workspaceId: string
  scriptId: string
  apiFetch: ApiFetch
}

const TERMINAL_STATUSES = new Set(['DONE', 'FAILED'])
const POLL_INTERVAL_MS = 4000

const VOICE_LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
]

export function VideoJobPanel({ workspaceId, scriptId, apiFetch }: Props) {
  const { getToken } = useAuth()
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [language, setLanguage] = useState('ru')
  const [error, setError] = useState('')
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  useEffect(() => {
    if (!videoJob) return
    if (TERMINAL_STATUSES.has(videoJob.status)) {
      stopPolling()
      return
    }
    if (pollingRef.current) return

    pollingRef.current = setInterval(async () => {
      try {
        const r = await apiFetch(`/workspaces/${workspaceId}/video-jobs/${videoJob.id}`)
        if (!r.ok) return
        const data = (await r.json()) as VideoJob
        setVideoJob(data)
        if (TERMINAL_STATUSES.has(data.status)) stopPolling()
      } catch {
        // transient network error, keep polling
      }
    }, POLL_INTERVAL_MS)
  }, [videoJob?.id, videoJob?.status])  // eslint-disable-line react-hooks/exhaustive-deps

  // The MP4 lives in private storage — play it through the authenticated API proxy,
  // passing the Clerk token as a query param since <video> can't send headers.
  useEffect(() => {
    if (videoJob?.status !== 'DONE' || !videoJob.outputUrl) { setVideoSrc(null); return }
    let active = true
    void getToken().then(t => {
      if (active) setVideoSrc(`${API_BASE}/workspaces/${workspaceId}/video-jobs/${videoJob.id}/output?token=${encodeURIComponent(t ?? '')}`)
    })
    return () => { active = false }
  }, [videoJob?.status, videoJob?.id, videoJob?.outputUrl, workspaceId, getToken])

  async function handleGenerate() {
    setIsStarting(true)
    setError('')
    setVideoJob(null)
    stopPolling()
    try {
      const r = await apiFetch(`/workspaces/${workspaceId}/scripts/${scriptId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      })
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to start video generation')
      }
      const job = (await r.json()) as VideoJob
      setVideoJob(job)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start video generation')
    } finally {
      setIsStarting(false)
    }
  }

  const isDone = videoJob?.status === 'DONE'
  const isFailed = videoJob?.status === 'FAILED'
  const isActive = videoJob && !isDone && !isFailed

  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Short-Form Video
      </p>

      {/* Language select + Launch button */}
      {!videoJob && (
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={isStarting}
            className="text-sm border rounded px-2 py-1.5 bg-white disabled:opacity-50"
          >
            {VOICE_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={isStarting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {isStarting && <Spinner />}
            {isStarting ? 'Starting…' : 'Generate Video'}
          </button>
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Progress */}
      {videoJob && (
        <div className="flex flex-col gap-3">
          {/* Job status badge */}
          <div className="flex items-center gap-2">
            <StatusBadge status={videoJob.status} />
            {isActive && <Spinner />}
            {!isDone && !isFailed && (
              <span className="text-xs text-gray-400">
                {statusLabel(videoJob.status)}
              </span>
            )}
          </div>

          {/* Per-shot chips */}
          {videoJob.shots && videoJob.shots.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {videoJob.shots.map(shot => (
                <ShotChip key={shot.id} shot={shot} />
              ))}
            </div>
          )}

          {/* Auto QA verdict (PASS/WARN/BLOCK), computed live from the finished video —
              the same checks the campaign approval gate uses. */}
          {isDone && videoJob.qa && (
            <QaBadge status={videoJob.qa.status} findings={videoJob.qa.findings} />
          )}

          {/* Error message */}
          {isFailed && videoJob.errorMessage && (
            <p className="text-red-500 text-sm">{videoJob.errorMessage}</p>
          )}

          {/* Video output (streamed via the authenticated API proxy) */}
          {isDone && videoSrc && (
            <div className="flex flex-col gap-2">
              <video
                src={videoSrc}
                controls
                className="rounded max-w-xs"
                style={{ aspectRatio: '9/16', maxHeight: 360 }}
              />
              <a
                href={videoSrc}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline w-fit"
              >
                Download MP4
              </a>
            </div>
          )}

          {/* Regenerate */}
          {(isDone || isFailed) && (
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                disabled={isStarting}
                className="text-sm border rounded px-2 py-1.5 bg-white disabled:opacity-50"
              >
                {VOICE_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={isStarting}
                className="flex items-center gap-2 px-3 py-1.5 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {isStarting && <Spinner />}
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ShotChip({ shot }: { shot: VideoShot }) {
  const [showTooltip, setShowTooltip] = useState(false)

  const chipClass = {
    PENDING: 'bg-gray-100 text-gray-500',
    SUBMITTED: 'bg-blue-100 text-blue-600',
    DONE: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-600 cursor-help',
  }[shot.status]

  return (
    <div className="relative inline-block">
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${chipClass}`}
        onMouseEnter={() => shot.status === 'FAILED' && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        Shot {shot.index + 1}
        {shot.status === 'FAILED' && ' ✗'}
        {shot.status === 'DONE' && ' ✓'}
      </span>
      {showTooltip && shot.errorMessage && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-gray-800 text-white text-xs rounded p-2 z-10 pointer-events-none">
          {shot.errorMessage}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: VideoJob['status'] }) {
  const cfg: Record<VideoJob['status'], { label: string; cls: string }> = {
    PENDING:        { label: 'Queued',           cls: 'bg-gray-100 text-gray-600' },
    STORYBOARDING:  { label: 'Storyboarding',    cls: 'bg-purple-100 text-purple-700' },
    RENDERING_SHOTS:{ label: 'Rendering shots',  cls: 'bg-blue-100 text-blue-700' },
    STITCHING:      { label: 'Stitching',        cls: 'bg-yellow-100 text-yellow-700' },
    DONE:           { label: 'Done',             cls: 'bg-green-100 text-green-700' },
    FAILED:         { label: 'Failed',           cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = cfg[status]
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>
  )
}

function statusLabel(status: VideoJob['status']): string {
  const labels: Record<VideoJob['status'], string> = {
    PENDING: 'Waiting for worker…',
    STORYBOARDING: 'Generating shot list with AI…',
    RENDERING_SHOTS: 'Rendering clips via Higgsfield…',
    STITCHING: 'Stitching final video…',
    DONE: '',
    FAILED: '',
  }
  return labels[status]
}

function Spinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  )
}
