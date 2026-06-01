export interface VideoGenParams {
  prompt: string
  durationSec?: number    // default 5
  aspectRatio?: '9:16' | '16:9' | '1:1'  // default 9:16
}

export interface VideoGenResult {
  videoUrl: string
}

interface HiggsfieldJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  output?: { url: string }
  error?: string
}

async function higgsfieldFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = process.env.HIGGSFIELD_API_KEY
  if (!apiKey) throw new Error('HIGGSFIELD_API_KEY is not set')

  const base = (process.env.HIGGSFIELD_API_URL ?? 'https://platform.higgsfield.ai/v1').replace(/\/$/, '')

  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  })
}

export async function submitVideoJob(params: VideoGenParams): Promise<string> {
  const res = await higgsfieldFetch('/generations', {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt,
      duration: params.durationSec ?? 5,
      aspect_ratio: params.aspectRatio ?? '9:16',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Higgsfield submit failed ${res.status}: ${text}`)
  }

  const data = await res.json() as { id?: string; generation_id?: string }
  const jobId = data.id ?? data.generation_id
  if (!jobId) throw new Error('Higgsfield response missing job id')
  return jobId
}

export async function pollVideoJob(
  jobId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<VideoGenResult> {
  const interval = options.intervalMs ?? 5_000
  const timeout = options.timeoutMs ?? 5 * 60_000
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const res = await higgsfieldFetch(`/generations/${jobId}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Higgsfield poll failed ${res.status}: ${text}`)
    }

    const job = await res.json() as HiggsfieldJob

    if (job.status === 'completed') {
      const videoUrl = job.output?.url
      if (!videoUrl) throw new Error('Higgsfield job completed but no output URL')
      return { videoUrl }
    }

    if (job.status === 'failed') {
      throw new Error(`Higgsfield generation failed: ${job.error ?? 'unknown error'}`)
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(`Higgsfield generation timed out after ${timeout / 1000}s`)
}

export async function generateVideo(params: VideoGenParams): Promise<VideoGenResult> {
  const jobId = await submitVideoJob(params)
  return pollVideoJob(jobId)
}
