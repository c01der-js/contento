# Phase 0: Video Pipeline Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить главные убийцы качества видео в пайплайне Higgsfield: обрезанный/замороженный липсинк (хардкод `duration: 5`), дешёвые параметры генерации (`mid`, `dop-lite`, кадр 3:4 вместо 9:16), игнорирование персоны аватара, отсутствие ретраев и гонку двойного stitch.

**Architecture:** Точечные изменения в `packages/ai` (Higgsfield/ElevenLabs клиенты + новые pure-хелперы) и `apps/video-worker` (воркер генерации/склейки). Никаких изменений схемы БД. Все новые функции — чистые и тестируемые (паттерн `buildConcatArgs`), сетевые вызовы оборачиваются в retry-хелпер.

**Tech Stack:** TypeScript ESM (NodeNext, импорты с `.js`), pnpm + Turborepo, vitest, Prisma, BullMQ, ffmpeg.

**Facts про Higgsfield API (проверено по официальному SDK higgsfield-js и Segmind-докам):**
- `speak/higgsfield`: `duration` принимает ТОЛЬКО `5 | 10 | 15`; `quality`: `'mid' | 'high'`.
- `text2image/soul`: `width_and_height` — 13 фиксированных строк; единственный честный 9:16 — `'1152x2048'`; `quality`: `'720p' | '1080p'`; есть `seed` (1–1 000 000); **`negative_prompt` НЕ поддерживается**.
- `image2video/dop`: `model` ∈ `'dop-lite' | 'dop-turbo' | 'dop-standard'`; есть `seed`.

---

## File Structure

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `packages/ai/src/retry.ts` | создать | `withRetry()` + `HttpStatusError` — единый retry с экспоненциальным backoff |
| `packages/ai/src/retry.test.ts` | создать | тесты retry |
| `packages/ai/src/higgsfield/audio.ts` | создать | `wavDurationSec()`, `speakDurationFor()` — чистые функции |
| `packages/ai/src/higgsfield/audio.test.ts` | создать | тесты аудио-хелперов |
| `packages/ai/src/higgsfield/client.ts` | изменить | param-билдеры (9:16, high, dop-standard, seed), duration в Speak, ретраи, таймаут 15 мин |
| `packages/ai/src/higgsfield/client.test.ts` | создать | тесты param-билдеров |
| `packages/ai/src/higgsfield/index.ts` | изменить | экспорт новых хелперов |
| `packages/ai/src/index.ts` | изменить | экспорт retry |
| `packages/ai/src/elevenlabs/client.ts` | изменить | ретраи |
| `apps/video-worker/src/worker.ts` | изменить | soulId/characterDescription из AvatarPersona, seed per job, duration, идемпотентный stitch |
| `apps/video-worker/src/video-worker.test.ts` | изменить | тесты jobSeed + идемпотентного stitch |
| `apps/api/src/routes/webhooks.ts` | изменить | dedupe stitch через BullMQ jobId |
| `infra/.env.example` | изменить | новые опциональные env-переменные |

---

### Task 1: Зафиксировать текущие незакоммиченные фиксы

Рабочее дерево содержит готовые фиксы (загрузка аудио на Higgsfield CDN, авторизованное скачивание клипов для stitch, cancellation-safe campaign-producer). Коммитим их как чистую базу.

**Files:**
- Modify: ничего — только verify + commit

- [ ] **Step 1: Сгенерировать Prisma-клиент и собрать db**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: завершается без ошибок (клиент не закоммичен, без него typecheck падает).

- [ ] **Step 2: Typecheck всего репо**

Run: `pnpm typecheck`
Expected: все пакеты проходят. Если падает — остановиться и разобраться (фиксы в дереве должны быть рабочими).

- [ ] **Step 3: Тесты всего репо**

Run: `pnpm test`
Expected: все тесты зелёные.

- [ ] **Step 4: Закоммитить рабочее дерево**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add apps/api/src/jobs/campaign-producer.ts apps/api/src/lib/s3.ts apps/api/src/plugins/auth.ts \
  apps/api/src/routes/campaigns.ts apps/api/src/routes/video.ts apps/api/src/routes/webhooks.ts \
  apps/video-worker/src/index.ts apps/video-worker/src/s3-client.ts apps/video-worker/src/stitch.ts \
  apps/video-worker/src/webhook-handler.ts apps/video-worker/src/worker.ts \
  apps/web/src/app/\[locale\]/\(app\)/create/_components/VideoJobPanel.tsx \
  apps/web/src/app/\[locale\]/\(app\)/review/campaigns/\[id\]/page.tsx \
  apps/web/src/app/\[locale\]/\(app\)/studio/campaigns/\[id\]/page.tsx \
  packages/ai/src/agents/scriptwriter.ts packages/ai/src/elevenlabs/client.ts \
  packages/ai/src/higgsfield/client.ts packages/ai/src/higgsfield/index.ts \
  docs/superpowers/specs/ docs/superpowers/plans/
git commit -m "fix(video): upload TTS audio to Higgsfield CDN, auth S3 clip download for stitch, cancellation-safe campaign producer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Аудио-хелперы — длительность WAV и допустимый SpeakDuration

**Files:**
- Create: `packages/ai/src/higgsfield/audio.ts`
- Create: `packages/ai/src/higgsfield/audio.test.ts`
- Modify: `packages/ai/src/higgsfield/index.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/ai/src/higgsfield/audio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mockWavBuffer } from './mock.js'
import { wavDurationSec, speakDurationFor } from './audio.js'

describe('wavDurationSec', () => {
  it('returns 0 for the empty mock WAV', () => {
    expect(wavDurationSec(mockWavBuffer())).toBe(0)
  })

  it('computes duration from data chunk size and byte rate', () => {
    // mock header: PCM16 mono 44.1kHz => byteRate 88200; append 3s of data
    const header = mockWavBuffer()
    const dataBytes = 88200 * 3
    const wav = Buffer.concat([header, Buffer.alloc(dataBytes)])
    wav.writeUInt32LE(36 + dataBytes, 4) // RIFF size
    wav.writeUInt32LE(dataBytes, 40) // data chunk size
    expect(wavDurationSec(wav)).toBeCloseTo(3)
  })

  it('throws on a non-WAV buffer', () => {
    expect(() => wavDurationSec(Buffer.from('definitely not a wav file'))).toThrow(/RIFF/)
  })
})

describe('speakDurationFor', () => {
  it.each([
    [0.5, 5],
    [5, 5],
    [5.1, 10],
    [10, 10],
    [10.1, 15],
    [60, 15],
  ])('maps %s sec of audio to allowed duration %s', (audioSec, expected) => {
    expect(speakDurationFor(audioSec)).toBe(expected)
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/audio.test.ts`
Expected: FAIL — `Cannot find module './audio.js'`

- [ ] **Step 3: Реализовать хелперы**

Создать `packages/ai/src/higgsfield/audio.ts`:

```ts
/**
 * Duration of a PCM WAV buffer in seconds, derived from the RIFF header
 * (data chunk size / fmt byte rate). Works on the canonical 44-byte header
 * that ffmpeg's `-f wav` emits, and tolerates extra chunks before `data`.
 */
export function wavDurationSec(wav: Buffer): number {
  if (
    wav.length < 44 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('wavDurationSec: buffer is not a RIFF/WAVE file')
  }
  let byteRate = 0
  let offset = 12
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4)
    const chunkSize = wav.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ') byteRate = wav.readUInt32LE(offset + 16)
    if (chunkId === 'data') {
      if (byteRate === 0) throw new Error('wavDurationSec: fmt chunk not found before data')
      return chunkSize / byteRate
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  throw new Error('wavDurationSec: data chunk not found')
}

/** The only durations Higgsfield Speak accepts (per official SDK SpeakDuration enum). */
export type SpeakDuration = 5 | 10 | 15

/**
 * Smallest allowed Speak duration that fits the audio. Audio longer than 15s
 * is clamped — the storyboard agent should keep dialogue under ~15s per shot.
 */
export function speakDurationFor(audioSec: number): SpeakDuration {
  if (audioSec <= 5) return 5
  if (audioSec <= 10) return 10
  return 15
}
```

- [ ] **Step 4: Прогнать тест**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/audio.test.ts`
Expected: PASS (6 тестов)

- [ ] **Step 5: Экспортировать из higgsfield/index.ts**

В `packages/ai/src/higgsfield/index.ts` добавить после строки `export { isMockMode, ... } from './mock.js'`:

```ts
export { wavDurationSec, speakDurationFor } from './audio.js'
export type { SpeakDuration } from './audio.js'
```

- [ ] **Step 6: Typecheck и commit**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS

```bash
git add packages/ai/src/higgsfield/audio.ts packages/ai/src/higgsfield/audio.test.ts packages/ai/src/higgsfield/index.ts
git commit -m "feat(ai): WAV duration parsing and Speak duration mapping helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Retry-хелпер с экспоненциальным backoff

**Files:**
- Create: `packages/ai/src/retry.ts`
- Create: `packages/ai/src/retry.test.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/ai/src/retry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { withRetry, HttpStatusError } from './retry.js'

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient network errors and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('retries 429 and 5xx HttpStatusError', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpStatusError(429, 'rate limited'))
      .mockRejectedValueOnce(new HttpStatusError(502, 'bad gateway'))
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry non-429 4xx errors', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpStatusError(400, 'invalid_audio_format'))
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('invalid_audio_format')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpStatusError(503, 'down'))
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('down')
    expect(fn).toHaveBeenCalledTimes(3) // 1 попытка + 2 ретрая
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @contento/ai exec vitest run src/retry.test.ts`
Expected: FAIL — `Cannot find module './retry.js'`

- [ ] **Step 3: Реализовать retry.ts**

Создать `packages/ai/src/retry.ts`:

```ts
/** HTTP error that preserves the status code so retry logic can classify it. */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpStatusError'
  }
}

export interface RetryOptions {
  /** Extra attempts after the first one (default 3). */
  retries?: number
  /** Delay before retry #1; doubles each retry (default 1000ms). */
  baseDelayMs?: number
  onRetry?: (attempt: number, err: unknown) => void
}

function isTransient(err: unknown): boolean {
  // Deterministic client errors (bad payload, auth) must not be retried;
  // 429 and 5xx are worth retrying. Anything non-HTTP (network failure,
  // fetch TypeError) is treated as transient.
  if (err instanceof HttpStatusError) return err.status === 429 || err.status >= 500
  return true
}

/** Run `fn` with exponential backoff on transient failures. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 1000
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === retries) throw err
      opts.onRetry?.(attempt + 1, err)
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastErr
}
```

- [ ] **Step 4: Прогнать тест**

Run: `pnpm --filter @contento/ai exec vitest run src/retry.test.ts`
Expected: PASS (5 тестов)

- [ ] **Step 5: Экспортировать из пакета**

В `packages/ai/src/index.ts` добавить:

```ts
export { withRetry, HttpStatusError } from './retry.js'
export type { RetryOptions } from './retry.js'
```

- [ ] **Step 6: Typecheck и commit**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS

```bash
git add packages/ai/src/retry.ts packages/ai/src/retry.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): withRetry helper with exponential backoff and HTTP status classification

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Higgsfield client — 9:16, high quality, dop-standard, seed, реальная длительность, ретраи, таймаут 15 мин

**Files:**
- Modify: `packages/ai/src/higgsfield/client.ts`
- Create: `packages/ai/src/higgsfield/client.test.ts`
- Modify: `packages/ai/src/higgsfield/index.ts`

- [ ] **Step 1: Написать падающий тест на param-билдеры**

Создать `packages/ai/src/higgsfield/client.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildSoulParams, buildSpeakParams, buildDopParams } from './client.js'

const ENV_KEYS = ['HIGGSFIELD_SPEAK_QUALITY', 'HIGGSFIELD_DOP_MODEL'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('buildSoulParams', () => {
  it('uses vertical 9:16 frame and 1080p', () => {
    const p = buildSoulParams('a man talking', 'soul-1')
    expect(p.width_and_height).toBe('1152x2048')
    expect(p.quality).toBe('1080p')
    expect(p.custom_reference_id).toBe('soul-1')
    expect(p.batch_size).toBe(1)
  })

  it('passes seed through when provided', () => {
    expect(buildSoulParams('x', 's', { seed: 42 }).seed).toBe(42)
    expect('seed' in buildSoulParams('x', 's')).toBe(false)
  })
})

describe('buildSpeakParams', () => {
  it('defaults to high quality and maps audio duration to allowed value', () => {
    const p = buildSpeakParams('http://img', 'http://audio', 'talking head', 7.2)
    expect(p.quality).toBe('high')
    expect(p.duration).toBe(10)
    expect(p.input_image).toEqual({ type: 'image_url', image_url: 'http://img' })
    expect(p.input_audio).toEqual({ type: 'audio_url', audio_url: 'http://audio' })
  })

  it('honors HIGGSFIELD_SPEAK_QUALITY override', () => {
    process.env['HIGGSFIELD_SPEAK_QUALITY'] = 'mid'
    expect(buildSpeakParams('i', 'a', 'p', 3).quality).toBe('mid')
  })
})

describe('buildDopParams', () => {
  it('defaults to dop-standard', () => {
    const p = buildDopParams('http://img', 'pan over product')
    expect(p.model).toBe('dop-standard')
    expect(p.input_images).toEqual([{ type: 'image_url', image_url: 'http://img' }])
  })

  it('honors HIGGSFIELD_DOP_MODEL override and seed', () => {
    process.env['HIGGSFIELD_DOP_MODEL'] = 'dop-turbo'
    const p = buildDopParams('i', 'p', { seed: 7 })
    expect(p.model).toBe('dop-turbo')
    expect(p.seed).toBe(7)
  })
})
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/client.test.ts`
Expected: FAIL — `buildSoulParams` не экспортируется

- [ ] **Step 3: Переписать client.ts**

Полное новое содержимое `packages/ai/src/higgsfield/client.ts` (изменения: импорты `withRetry`/`HttpStatusError`/`speakDurationFor`, таймаут 15 мин, `HttpStatusError` вместо `Error` на HTTP-ошибках, retry вокруг каждого сетевого вызова, новые экспортируемые билдеры, новые сигнатуры submit-функций):

```ts
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
    quality: process.env['HIGGSFIELD_SPEAK_QUALITY'] ?? 'high',
    // Speak accepts only 5 | 10 | 15. The previous hardcoded 5 truncated any
    // longer voiceover and froze the tail of shorter ones.
    duration: speakDurationFor(audioDurationSec),
  }
}

/** Request params for POST /v1/image2video/dop. Exported for tests. */
export function buildDopParams(imageUrl: string, prompt: string, options?: { seed?: number }) {
  return {
    model: process.env['HIGGSFIELD_DOP_MODEL'] ?? 'dop-standard',
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
```

- [ ] **Step 4: Экспортировать билдеры из higgsfield/index.ts**

В `packages/ai/src/higgsfield/index.ts` дополнить экспорт из `./client.js`:

```ts
export {
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  generateCharacterPortrait,
  uploadToHiggsfield,
  buildSoulParams,
  buildSpeakParams,
  buildDopParams,
} from './client.js'
export type { SoulFrameOptions } from './client.js'
```

- [ ] **Step 5: Прогнать тесты и typecheck**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/client.test.ts`
Expected: PASS (6 тестов)

Run: `pnpm --filter @contento/ai run typecheck`
Expected: **FAIL в apps/video-worker НЕ проверяется этим фильтром**; сам пакет ai должен пройти. Воркер чинится в Task 5 — это ожидаемая последовательность (typecheck всего репо прогоняется в Task 6).

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/higgsfield/client.ts packages/ai/src/higgsfield/client.test.ts packages/ai/src/higgsfield/index.ts
git commit -m "feat(ai): 9:16 soul frames, high speak quality, dop-standard, real audio duration, retries, 15min poll timeout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Ретраи в ElevenLabs client**

В `packages/ai/src/elevenlabs/client.ts` заменить содержимое `synthesizeSpeech` (импорт добавить вверху файла):

```ts
import { withRetry, HttpStatusError } from '../retry.js'
```

```ts
export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const voiceToUse = voiceId || process.env['ELEVENLABS_VOICE_ID'] || ''
  if (!voiceToUse) throw new Error('ELEVENLABS_VOICE_ID is not set')

  return withRetry(async () => {
    const response = await fetch(
      `${BASE_URL}/text-to-speech/${voiceToUse}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey(),
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      throw new HttpStatusError(response.status, `ElevenLabs TTS error ${response.status}: ${err}`)
    }

    return Buffer.from(await response.arrayBuffer())
  })
}
```

Run: `pnpm --filter @contento/ai run typecheck` → PASS

```bash
git add packages/ai/src/elevenlabs/client.ts
git commit -m "feat(ai): retry ElevenLabs TTS on transient failures

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: video-worker — персона аватара, seed per job, реальная длительность, идемпотентный stitch

**Files:**
- Modify: `apps/video-worker/src/worker.ts`
- Modify: `apps/video-worker/src/video-worker.test.ts`
- Modify: `apps/api/src/routes/webhooks.ts`

- [ ] **Step 1: Написать падающие тесты**

В `apps/video-worker/src/video-worker.test.ts` ЗАМЕНИТЬ существующие mock-фабрики `@contento/db` и `./s3-client.js` на расширенные и добавить моки `bullmq`/`@contento/ai`/`./stitch.js` (нужны, потому что теперь импортируется `worker.js`). Итоговый блок моков в начале файла (вместо текущих `vi.mock('@contento/db', ...)` и `vi.mock('./s3-client.js', ...)`):

```ts
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
const mockFindMany = vi.fn()
const mockJobUpdateMany = vi.fn()

vi.mock('@contento/db', () => ({
  prisma: {
    videoShot: {
      findFirst: mockFindFirst,
      update: mockUpdate,
      findMany: mockFindMany,
    },
    videoJob: {
      update: mockUpdate,
      updateMany: mockJobUpdateMany,
      findUnique: vi.fn(),
    },
    avatarPersona: { findUnique: vi.fn() },
    contentPlanItem: { findFirst: vi.fn() },
    script: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

// Mock fetch for clip download
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockUploadBuffer = vi.fn()
vi.mock('./s3-client.js', () => ({
  uploadBuffer: mockUploadBuffer,
  uploadVideo: vi.fn(),
  downloadBuffer: vi.fn(),
  keyFromUrl: vi.fn((u: string) => u),
}))

vi.mock('bullmq', () => ({
  Worker: class {},
  Queue: class {
    add = vi.fn()
  },
}))

vi.mock('@contento/ai', () => ({
  generateVideoStoryboard: vi.fn(),
  submitSoulCharacterFrame: vi.fn(),
  submitTalkingAvatarClip: vi.fn(),
  submitImageToVideo: vi.fn(),
  pollJobUntilDone: vi.fn(),
  synthesizeSpeech: vi.fn(),
  uploadToHiggsfield: vi.fn(),
  wavDurationSec: vi.fn(() => 3),
  isMockMode: () => true,
  MOCK_CLIP_URL: 'https://example.com/mock.mp4',
}))
```

И добавить в конец файла новые тесты:

```ts
// ─── worker: jobSeed + idempotent stitch ─────────────────────────────────────

import { jobSeed, handleStitch } from './worker.js'

describe('jobSeed', () => {
  it('is deterministic for the same videoJobId', () => {
    expect(jobSeed('cmb1234abcd')).toBe(jobSeed('cmb1234abcd'))
  })

  it('differs across jobs and stays within Higgsfield seed range', () => {
    const a = jobSeed('job-a')
    const b = jobSeed('job-b')
    expect(a).not.toBe(b)
    for (const s of [a, b]) {
      expect(s).toBeGreaterThanOrEqual(1)
      expect(s).toBeLessThanOrEqual(1_000_000)
    }
  })
})

describe('handleStitch idempotency', () => {
  it('returns without stitching when another run already claimed the job', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 0 })
    await handleStitch({ videoJobId: 'vj-claimed' })
    expect(mockJobUpdateMany).toHaveBeenCalledWith({
      where: { id: 'vj-claimed', status: 'RENDERING_SHOTS' },
      data: { status: 'STITCHING' },
    })
    // claim failed -> no shot lookup, no S3, no ffmpeg
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
```

Замечание для исполнителя: `import { handleStitch, jobSeed }` в середине файла после `vi.mock` — это паттерн, уже используемый этим файлом (`import { handleHiggsfieldWebhook } ...` на строке 50); vitest хойстит `vi.mock` выше всех импортов.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm --filter @contento/video-worker exec vitest run src/video-worker.test.ts`
Expected: FAIL — `jobSeed`/`handleStitch` не экспортируются из `./worker.js`. (Если имя пакета другое — посмотреть `"name"` в `apps/video-worker/package.json` и использовать его в `--filter`.)

- [ ] **Step 3: Изменить worker.ts**

В `apps/video-worker/src/worker.ts`:

3a. Дополнить импорт из `@contento/ai` (добавить `wavDurationSec`):

```ts
import {
  generateVideoStoryboard,
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  synthesizeSpeech,
  uploadToHiggsfield,
  wavDurationSec,
  isMockMode,
  MOCK_CLIP_URL,
} from '@contento/ai'
```

3b. Добавить `soulId` в payload (его уже шлёт campaign-producer, но воркер игнорировал):

```ts
export interface VideoJobPayload {
  videoJobId: string
  scriptId: string
  workspaceId: string
  language: string
  /** Optional override; otherwise resolved from AvatarPersona, then env. */
  soulId?: string
}
```

3c. Добавить экспортируемый хелпер сразу после `isCampaignJobCancelled`:

```ts
/**
 * Deterministic Higgsfield seed (1–1,000,000) derived from the videoJobId.
 * One stable seed per video keeps lighting/style coherent across its shots
 * without needing a DB column.
 */
export function jobSeed(videoJobId: string): number {
  let h = 0
  for (let i = 0; i < videoJobId.length; i++) h = (h * 31 + videoJobId.charCodeAt(i)) >>> 0
  return (h % 1_000_000) + 1
}
```

3d. В `handleGenerate` — сигнатура принимает payload целиком с `soulId`:

```ts
async function handleGenerate(
  { videoJobId, scriptId, workspaceId, language, soulId: payloadSoulId }: VideoJobPayload,
  enqueueStitch: (id: string) => Promise<void>,
) {
```

3e. Перед вызовом `generateVideoStoryboard` (после early-return проверки отмены) добавить резолв персоны и передать описание персонажа в storyboard:

```ts
  // Resolve the workspace avatar: Soul ID for Higgsfield + a concrete character
  // description for the storyboard (so every shot prompt describes the SAME person).
  const persona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
  const soulId = payloadSoulId ?? persona?.higgsfieldSoulId ?? process.env['HIGGSFIELD_SOUL_ID'] ?? ''
  const characterDescription = persona
    ? `${persona.description} (style: ${persona.style}, gender: ${persona.gender})`
    : undefined

  const shots = await generateVideoStoryboard(workspaceId, {
    hook: script.hook,
    body: script.body,
    cta: script.cta,
  }, { language, ...(characterDescription ? { characterDescription } : {}) })
```

3f. Удалить старую строку `const soulId = process.env['HIGGSFIELD_SOUL_ID'] ?? ''` (она ниже, рядом с `voiceId`). На её месте оставить:

```ts
  const voiceId = process.env['ELEVENLABS_VOICE_ID'] ?? ''
  const mock = isMockMode()
  const seed = jobSeed(videoJobId)
```

3g. В цикле шотов, в ветке `else` (не mock), перед Step 1 добавить явную проверку soulId, затем посчитать длительность и передать новые параметры:

```ts
      } else {
        if (!soulId) {
          throw new Error(
            'No Higgsfield Soul ID: create an AvatarPersona for this workspace or set HIGGSFIELD_SOUL_ID',
          )
        }
        // Step 1: ElevenLabs TTS (only if the shot has spoken dialogue)
        let audioUrl: string | undefined
        let audioSec = 0
        if (shot.dialogue) {
          // ElevenLabs returns MP3 (tier-safe); Higgsfield Speak requires WAV.
          const mp3Buffer = await synthesizeSpeech(shot.dialogue, voiceId)
          const wavBuffer = await transcodeMp3ToWav(mp3Buffer)
          audioSec = wavDurationSec(wavBuffer)
          // Speak fetches the audio itself, so it must live on Higgsfield's CDN —
          // our private/local S3 URL would be unreachable (-> invalid_audio_format).
          // Higgsfield's upload endpoint requires the MIME 'audio/x-wav' for WAV.
          audioUrl = await uploadToHiggsfield(wavBuffer, 'audio/x-wav')
        }

        // Step 2: Higgsfield Soul Character → character image
        const charRequestId = await submitSoulCharacterFrame(shot.prompt, soulId, { seed })
        const imageUrl = await pollJobUntilDone(charRequestId)

        // Step 3a: talking avatar with lip-sync (has dialogue + audio)
        // Step 3b: silent motion video via DoP (no dialogue)
        let videoRequestId: string
        if (audioUrl) {
          videoRequestId = await submitTalkingAvatarClip(imageUrl, audioUrl, shot.prompt, audioSec)
        } else {
          videoRequestId = await submitImageToVideo(imageUrl, shot.prompt, { seed })
        }
```

(остальная часть ветки — poll, download, upload — без изменений)

3h. `handleStitch` — экспортировать и сделать идемпотентным. Заменить первые строки:

```ts
export async function handleStitch({ videoJobId }: StitchJobPayload) {
  // Atomic claim: both the worker's inline path and the webhook path can enqueue
  // a stitch for the same job. Only the run that flips RENDERING_SHOTS → STITCHING
  // proceeds; the loser sees count 0 and exits without double-stitching.
  const claimed = await prisma.videoJob.updateMany({
    where: { id: videoJobId, status: 'RENDERING_SHOTS' },
    data: { status: 'STITCHING' },
  })
  if (claimed.count === 0) return
```

(строка `await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'STITCHING' } })` удаляется; всё остальное в функции без изменений)

3i. В `createWorker` дать stitch-jobs стабильный BullMQ jobId (дедупликация на уровне очереди):

```ts
  const enqueueStitch = async (videoJobId: string) => {
    await queue.add('stitch', { videoJobId } satisfies StitchJobPayload, { jobId: `stitch-${videoJobId}` })
  }
```

- [ ] **Step 4: Тот же jobId-дедуп в API-вебхуке**

В `apps/api/src/routes/webhooks.ts`, в функции `checkAndFinalizeJob`, заменить:

```ts
    const queue = getVideoQueue()
    await queue.add('stitch', { videoJobId })
```

на:

```ts
    const queue = getVideoQueue()
    // Same jobId as the worker's enqueueStitch — BullMQ drops the duplicate add
    // when both completion paths (inline polling + webhook) race.
    await queue.add('stitch', { videoJobId }, { jobId: `stitch-${videoJobId}` })
```

- [ ] **Step 5: Прогнать тесты воркера**

Run: `pnpm --filter @contento/video-worker exec vitest run src/video-worker.test.ts`
Expected: PASS (старые webhook-тесты + 3 новых)

- [ ] **Step 6: Typecheck обоих приложений**

Run: `pnpm --filter @contento/video-worker run typecheck && pnpm --filter @contento/api run typecheck`
Expected: PASS. Замечание: пакет `@contento/ai` должен быть пересобран (`pnpm --filter @contento/ai run build`), если typecheck воркера резолвит его по `dist/`.

- [ ] **Step 7: Commit**

```bash
git add apps/video-worker/src/worker.ts apps/video-worker/src/video-worker.test.ts apps/api/src/routes/webhooks.ts
git commit -m "feat(video-worker): avatar persona resolution, per-job seed, real speak duration, idempotent stitch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Документация env + финальная верификация

**Files:**
- Modify: `infra/.env.example`

- [ ] **Step 1: Добавить новые опциональные переменные в infra/.env.example**

Найти в `infra/.env.example` блок с `HF_KEY_ID` / `HF_KEY` / `HIGGSFIELD_SOUL_ID` и добавить рядом:

```bash
# Video generation quality overrides (optional)
# Speak (talking avatar) quality: mid | high. Default: high
HIGGSFIELD_SPEAK_QUALITY=
# Image-to-video model for silent shots: dop-lite | dop-turbo | dop-standard. Default: dop-standard
HIGGSFIELD_DOP_MODEL=
```

- [ ] **Step 2: Полный прогон репо**

Run: `pnpm typecheck && pnpm test`
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add infra/.env.example
git commit -m "docs(infra): document Higgsfield quality override env vars

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Что сознательно НЕ делаем в Phase 0

- Negative prompts — **API их не поддерживает**; качество промптов решается в Фазе 1 (storyboard-агент).
- Канонический master-портрет персонажа и тюнинг `custom_reference_strength` — Фаза 1.
- Remotion-монтаж, субтитры, нормализация разрешения при склейке — Фаза 2.
- Переписывание system prompts — Фаза 3.
- Убирание хардкода `language: 'ru'` в campaign-producer — Фаза 3 (для RU-беты безвреден).

## Риски

- Значение `seed` у Soul по Segmind-докам — 1–1 000 000 (SDK-валидатор: 0–1 000 000); `jobSeed` выдаёт 1–1 000 000, в обоих диапазонах.
- Если ElevenLabs-озвучка шота длиннее 15 с, Speak обрежет хвост (15 — максимум API). Контроль длины реплик добавится в промпт storyboard-агента в Фазе 1.
- `dop-standard` дороже `dop-lite` — стоимость за видео вырастет; счётчик стоимости появится в Фазе 4, при необходимости откат через `HIGGSFIELD_DOP_MODEL=dop-lite`.
