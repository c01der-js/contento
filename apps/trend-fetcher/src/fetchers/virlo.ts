import type { FetchedTrend, VirloConfig } from './types.js'

// ---------------------------------------------------------------------------
// Virlo API types (orbit async search pattern)
// ---------------------------------------------------------------------------

interface OrbitJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

interface VirloVideo {
  id: string
  title: string
  url: string
  description?: string
  platform: string
  author?: string
  views?: number
  likes?: number
  comments?: number
  shares?: number
  outlier_ratio?: number
  published_at?: string
  thumbnail_url?: string
}

interface OrbitResult {
  status: 'completed' | 'failed' | 'processing' | 'pending'
  videos?: VirloVideo[]
  error?: string
}

// ---------------------------------------------------------------------------
// Polling constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 3_000
const POLL_MAX_ATTEMPTS = 40   // 40 × 3 s = 2 min max wait
const BASE_URL = 'https://api.virlo.ai'

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchVirloTrends(config: VirloConfig): Promise<FetchedTrend[]> {
  const apiKey = process.env.VIRLO_API_KEY
  if (!apiKey) {
    console.warn('[trend-fetcher/virlo] VIRLO_API_KEY not set, skipping')
    return []
  }

  const limit = Math.min(config.limit ?? 10, 50)

  // Step 1: create orbit search job
  let jobId: string
  try {
    jobId = await createOrbit(apiKey, config.niche, limit, config.country)
  } catch (err) {
    console.error('[trend-fetcher/virlo] Failed to create orbit job: %o', err)
    return []
  }

  // Step 2: poll until completed
  let result: OrbitResult
  try {
    result = await pollOrbit(apiKey, jobId)
  } catch (err) {
    console.error('[trend-fetcher/virlo] Orbit polling failed for job %s: %o', jobId, err)
    return []
  }

  if (result.status !== 'completed' || !result.videos?.length) {
    console.warn('[trend-fetcher/virlo] Orbit job %s ended with status=%s', jobId, result.status)
    return []
  }

  return result.videos.map(normalizeVideo)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createOrbit(
  apiKey: string,
  niche: string,
  limit: number,
  country?: string,
): Promise<string> {
  const body: Record<string, unknown> = { query: niche, limit }
  if (country) body['country'] = country

  const res = await fetch(`${BASE_URL}/v1/orbit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Virlo orbit POST ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as OrbitJob
  if (!data.id) throw new Error('Virlo orbit response missing job id')
  return data.id
}

async function pollOrbit(apiKey: string, jobId: string): Promise<OrbitResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${BASE_URL}/v1/orbit/${jobId}/videos`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn('[trend-fetcher/virlo] Poll attempt %d HTTP %d', attempt + 1, res.status)
      continue
    }

    const data = (await res.json()) as OrbitResult

    if (data.status === 'completed' || data.status === 'failed') {
      return data
    }
  }

  return { status: 'failed', error: 'polling timeout' }
}

function normalizeVideo(video: VirloVideo): FetchedTrend {
  const parts: string[] = []

  if (video.outlier_ratio !== undefined) {
    parts.push(`outlier_ratio:${video.outlier_ratio.toFixed(2)}`)
  }
  if (video.views !== undefined) parts.push(`views:${video.views}`)
  if (video.likes !== undefined) parts.push(`likes:${video.likes}`)
  if (video.author) parts.push(`by @${video.author}`)

  const meta = parts.length ? ` [${parts.join(' | ')}]` : ''
  const description = video.description
    ? `${video.description}${meta}`
    : meta.trim() || undefined

  return {
    title: video.title,
    url: video.url,
    ...(description ? { description } : {}),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
