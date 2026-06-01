import type { HiggsfieldJobStatus } from './types.js'

const BASE_URL = 'https://platform.higgsfield.ai'
const POLL_INTERVAL_MS = 3000
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function credentials(): { keyId: string; keySecret: string } {
  const keyId = process.env['HF_KEY_ID']
  const keySecret = process.env['HF_KEY']
  if (!keyId) throw new Error('HF_KEY_ID is not set')
  if (!keySecret) throw new Error('HF_KEY is not set')
  return { keyId, keySecret }
}

function authHeader(): string {
  const { keyId, keySecret } = credentials()
  return `Key ${keyId}:${keySecret}`
}

// Generation endpoints use {params: {...}} wrapper; CRUD endpoints use flat body.
async function hfGenerate(path: string, params: unknown): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ params }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Higgsfield ${path} error ${res.status}: ${text}`)
  }
  const data = (await res.json()) as { id?: string }
  // v1 job-set response returns top-level `id` (the job-set ID)
  if (!data.id) throw new Error(`Higgsfield ${path} response missing id: ${JSON.stringify(data)}`)
  return data.id
}

/**
 * Poll GET /v1/job-sets/{id} until all jobs reach a terminal state.
 * Returns the first output image/video URL on success, throws on failure or timeout.
 */
export async function pollJobUntilDone(
  jobSetId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/v1/job-sets/${jobSetId}`, {
      headers: { Authorization: authHeader() },
    })
    if (!res.ok) throw new Error(`Higgsfield poll error ${res.status} for job-set ${jobSetId}`)

    const data = (await res.json()) as {
      jobs: Array<{
        status: HiggsfieldJobStatus
        results?: {
          raw?: { url: string }
          video?: { url: string }
        } | null
      }>
    }

    const jobs = data.jobs ?? []
    const terminal = ['completed', 'failed', 'nsfw'] as const

    if (jobs.every(j => (terminal as readonly string[]).includes(j.status))) {
      const failed = jobs.find(j => j.status === 'failed' || j.status === 'nsfw')
      if (failed) throw new Error(`Higgsfield job-set ${jobSetId} ended with status: ${failed.status}`)

      // Return first available output URL (image or video)
      for (const j of jobs) {
        const url = j.results?.raw?.url ?? j.results?.video?.url
        if (url) return url
      }
      throw new Error(`Higgsfield job-set ${jobSetId} completed but has no output URL`)
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  throw new Error(`Higgsfield job-set ${jobSetId} timed out after ${timeoutMs / 1000}s`)
}

/**
 * Generate a character image using Soul (consistent character via Soul ID).
 * soulId is the UUID from HIGGSFIELD_SOUL_ID (created once via POST /v1/custom-references).
 */
export async function submitSoulCharacterFrame(
  prompt: string,
  soulId: string,
): Promise<string> {
  return hfGenerate('/v1/text2image/soul', {
    prompt,
    custom_reference_id: soulId,
    custom_reference_strength: 0.85,
    width_and_height: '1536x2048',
    quality: '1080p',
    batch_size: 1,
  })
}

/**
 * Generate a talking-avatar video clip with lip-sync.
 * imageUrl — character image (output of submitSoulCharacterFrame + pollJobUntilDone)
 * audioUrl — WAV audio uploaded to S3 (output of ElevenLabs TTS)
 */
export async function submitTalkingAvatarClip(
  imageUrl: string,
  audioUrl: string,
  prompt: string,
): Promise<string> {
  return hfGenerate('/v1/speak/higgsfield', {
    input_image: { type: 'image_url', image_url: imageUrl },
    input_audio: { type: 'audio_url', audio_url: audioUrl },
    prompt,
    quality: 'mid',
    duration: 5,
  })
}

/**
 * Generate a silent motion video from a still image (for shots with no dialogue).
 * Uses DoP Lite (image-to-video, ~3s clip).
 */
export async function submitImageToVideo(
  imageUrl: string,
  prompt: string,
): Promise<string> {
  return hfGenerate('/v1/image2video/dop', {
    model: 'dop-lite',
    prompt,
    input_images: [{ type: 'image_url', image_url: imageUrl }],
  })
}

/**
 * Generate a character portrait image from a text description.
 * Uses Higgsfield foundation text2image (no Soul required).
 * Returns a jobSetId to poll with pollJobUntilDone().
 */
export async function generateCharacterPortrait(
  description: string,
  style: string,
  gender: string,
): Promise<string> {
  const prompt = `Portrait photo of a ${gender} ${style} professional brand ambassador. ${description}. Clean background, high quality, photorealistic, suitable for video avatar.`
  return hfGenerate('/v1/text2image/foundation', {
    prompt,
    width_and_height: '1024x1024',
    quality: '1080p',
    batch_size: 1,
  })
}
