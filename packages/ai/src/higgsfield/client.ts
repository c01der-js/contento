import type { HiggsfieldJobStatus } from './types.js'
import { withRetry, HttpStatusError } from '../retry.js'
import { speakDurationFor } from './audio.js'

const BASE_URL = 'https://platform.higgsfield.ai'
const POLL_INTERVAL_MS = 3000
// 15 min: heavy Speak/DoP jobs regularly exceed the previous 5 min and surfaced
// as spurious shot-level failures while Higgsfield was still rendering.
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

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

/**
 * Upload raw bytes to the Higgsfield CDN and return a public, Higgsfield-hosted URL.
 *
 * Speak (talking-avatar) accepts audio only as a URL it can fetch itself, so campaign
 * audio MUST live on Higgsfield's CDN — handing it a private/localhost storage URL
 * makes Higgsfield's fetch fail and surfaces as `400 invalid_audio_format`.
 *
 * Two-step flow (per the official Higgsfield SDK): ask for a presigned upload URL,
 * then PUT the bytes to it. The presigned PUT carries its own auth in the URL, so it
 * must NOT include the Higgsfield auth headers.
 */
export async function uploadToHiggsfield(data: Buffer, contentType: string): Promise<string> {
  const { keyId, keySecret } = credentials()
  const { upload_url, public_url } = await withRetry(async () => {
    const linkRes = await fetch(`${BASE_URL}/files/generate-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${keyId}:${keySecret}`,
        'hf-api-key': keyId,
        'hf-secret': keySecret,
      },
      body: JSON.stringify({ content_type: contentType }),
    })
    if (!linkRes.ok) {
      const text = await linkRes.text().catch(() => '')
      throw new HttpStatusError(linkRes.status, `Higgsfield /files/generate-upload-url error ${linkRes.status}: ${text}`)
    }
    return (await linkRes.json()) as { upload_url?: string; public_url?: string }
  })
  if (!upload_url || !public_url) {
    throw new Error(`Higgsfield upload-url response missing fields: ${JSON.stringify({ upload_url, public_url })}`)
  }

  await withRetry(async () => {
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: data,
    })
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => '')
      throw new HttpStatusError(putRes.status, `Higgsfield CDN upload (PUT) error ${putRes.status}: ${text}`)
    }
  })

  return public_url
}

// Generation endpoints use {params: {...}} wrapper; CRUD endpoints use flat body.
async function hfGenerate(path: string, params: unknown): Promise<string> {
  // NOTE: if the response body read fails after Higgsfield accepted the POST, the
  // retry re-submits and may orphan the first job (wasted credits, not corruption).
  // Accepted trade-off — the generation API has no idempotency keys.
  const data = await withRetry(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ params }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new HttpStatusError(res.status, `Higgsfield ${path} error ${res.status}: ${text}`)
    }
    return (await res.json()) as { id?: string }
  })
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
    const data = await withRetry(
      async () => {
        const res = await fetch(`${BASE_URL}/v1/job-sets/${jobSetId}`, {
          headers: { Authorization: authHeader() },
        })
        if (!res.ok) {
          throw new HttpStatusError(res.status, `Higgsfield poll error ${res.status} for job-set ${jobSetId}`)
        }
        return (await res.json()) as {
          jobs: Array<{
            status: HiggsfieldJobStatus
            results?: {
              raw?: { url: string }
              video?: { url: string }
            } | null
          }>
        }
      },
      { retries: 2 },
    )

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

export interface SoulFrameOptions {
  /** Fixed per-video-job seed keeps lighting/look stable across shots. 1–1,000,000. */
  seed?: number
}

/** Request params for POST /v1/text2image/soul. Exported for tests. */
export function buildSoulParams(prompt: string, soulId: string, options?: SoulFrameOptions) {
  return {
    prompt,
    custom_reference_id: soulId,
    custom_reference_strength: 0.85,
    // The only true 9:16 Soul size (per SDK SoulSize enum). The previous
    // 1536x2048 is 3:4 and produced non-vertical sources for vertical video.
    width_and_height: '1152x2048',
    quality: '1080p',
    batch_size: 1,
    ...(options?.seed != null ? { seed: options.seed } : {}),
  }
}

/** Request params for POST /v1/speak/higgsfield. Exported for tests. */
export function buildSpeakParams(imageUrl: string, audioUrl: string, prompt: string, audioDurationSec: number) {
  return {
    input_image: { type: 'image_url', image_url: imageUrl },
    input_audio: { type: 'audio_url', audio_url: audioUrl },
    prompt,
    quality: (process.env['HIGGSFIELD_SPEAK_QUALITY'] ?? 'high') as 'mid' | 'high',
    // Speak accepts only 5 | 10 | 15. The previous hardcoded 5 truncated any
    // longer voiceover and froze the tail of shorter ones.
    duration: speakDurationFor(audioDurationSec),
  }
}

/** Request params for POST /v1/image2video/dop. Exported for tests. */
export function buildDopParams(imageUrl: string, prompt: string, options?: { seed?: number }) {
  return {
    model: (process.env['HIGGSFIELD_DOP_MODEL'] ?? 'dop-standard') as 'dop-lite' | 'dop-turbo' | 'dop-standard',
    prompt,
    input_images: [{ type: 'image_url', image_url: imageUrl }],
    ...(options?.seed != null ? { seed: options.seed } : {}),
  }
}

/**
 * Generate a character image using Soul (consistent character via Soul ID).
 * soulId is the UUID from AvatarPersona.higgsfieldSoulId (or HIGGSFIELD_SOUL_ID).
 */
export async function submitSoulCharacterFrame(
  prompt: string,
  soulId: string,
  options?: SoulFrameOptions,
): Promise<string> {
  return hfGenerate('/v1/text2image/soul', buildSoulParams(prompt, soulId, options))
}

/**
 * Generate a talking-avatar video clip with lip-sync.
 * imageUrl — character image (output of submitSoulCharacterFrame + pollJobUntilDone)
 * audioUrl — WAV audio on the Higgsfield CDN (output of uploadToHiggsfield)
 * audioDurationSec — real voiceover length; mapped to the nearest allowed Speak duration
 */
export async function submitTalkingAvatarClip(
  imageUrl: string,
  audioUrl: string,
  prompt: string,
  audioDurationSec: number,
): Promise<string> {
  return hfGenerate('/v1/speak/higgsfield', buildSpeakParams(imageUrl, audioUrl, prompt, audioDurationSec))
}

/**
 * Generate a silent motion video from a still image (for shots with no dialogue).
 */
export async function submitImageToVideo(
  imageUrl: string,
  prompt: string,
  options?: { seed?: number },
): Promise<string> {
  return hfGenerate('/v1/image2video/dop', buildDopParams(imageUrl, prompt, options))
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
