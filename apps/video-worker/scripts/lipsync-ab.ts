/**
 * Lipsync A/B stand — Higgsfield Speak vs HeyGen Avatar IV, + Sync.so refiner.
 *
 * Fair test: ONE Russian voiceover (ElevenLabs) + ONE character portrait are fed to
 * BOTH avatar engines, then the best clip(s) are optionally re-synced by Sync.so.
 * Each arm is gated on its API key and isolated in try/catch, so partial credentials
 * still produce partial output.
 *
 * Run (keys live in the gitignored apps/video-worker/.env):
 *   pnpm --filter @contento/video-worker exec tsx --env-file=.env scripts/lipsync-ab.ts
 *
 * Env used: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, HF_KEY_ID, HF_KEY,
 *   HIGGSFIELD_SOUL_ID (optional), HEYGEN_API_KEY, SYNC_API_KEY.
 * Optional overrides: AB_SCRIPT (RU voiceover text), AB_IMAGE_URL (skip portrait gen),
 *   AB_CHARACTER (portrait description), AB_REFINE (higgsfield|heygen|both, default both).
 *
 * Output: clips + a summary table with cost estimates in $TMPDIR/contento-lipsync-ab/.
 */
import { mkdir, writeFile, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  synthesizeSpeech,
  generateCharacterPortrait,
  pollJobUntilDone,
  submitTalkingAvatarClip,
  uploadToHiggsfield,
  wavDurationSec,
} from '@contento/ai'
import { transcodeMp3ToWav } from '../src/stitch.js'

// ── config ────────────────────────────────────────────────────────────────────
const RU_SCRIPT =
  process.env['AB_SCRIPT'] ??
  'Привет! Сегодня я расскажу, как за пять минут собрать вздрагивающий от счастья контент. Учишься на ходу — и результат не заставит ждать. Подпишись, чтобы не пропустить.'
const CHARACTER =
  process.env['AB_CHARACTER'] ?? 'young friendly russian-speaking woman, casual creator, soft studio light'
const REFINE = (process.env['AB_REFINE'] ?? 'both').toLowerCase() // higgsfield | heygen | both | none
const OUT_DIR = join(tmpdir(), 'contento-lipsync-ab')

const has = (k: string) => Boolean(process.env[k])
const log = (m: string) => console.log(`[ab] ${m}`)

async function download(url: string, file: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const path = join(OUT_DIR, file)
  await writeFile(path, buf)
  return path
}

async function pollUntil<T>(
  label: string,
  fn: () => Promise<{ done: boolean; failed?: string; value?: T }>,
  { intervalMs = 6000, timeoutMs = 8 * 60 * 1000 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await fn()
    if (r.failed) throw new Error(`${label} failed: ${r.failed}`)
    if (r.done && r.value !== undefined) return r.value
    await new Promise(res => setTimeout(res, intervalMs))
  }
  throw new Error(`${label} timed out`)
}

// ── HeyGen (Avatar IV, talking photo + own audio) ───────────────────────────────
async function heygenUploadTalkingPhoto(imageBytes: Buffer, contentType: string): Promise<string> {
  const res = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: { 'X-Api-Key': process.env['HEYGEN_API_KEY']!, 'Content-Type': contentType },
    body: imageBytes,
  })
  const json = (await res.json()) as { data?: { talking_photo_id?: string; id?: string }; error?: unknown }
  if (!res.ok) throw new Error(`HeyGen talking_photo upload ${res.status}: ${JSON.stringify(json)}`)
  const id = json.data?.talking_photo_id ?? json.data?.id
  if (!id) throw new Error(`HeyGen talking_photo: no id in ${JSON.stringify(json)}`)
  return id
}

async function heygenGenerate(talkingPhotoId: string, audioUrl: string): Promise<string> {
  const create = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': process.env['HEYGEN_API_KEY']!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: 'square', scale: 1.0 },
          voice: { type: 'audio', audio_url: audioUrl },
        },
      ],
      dimension: { width: 1080, height: 1920 },
      use_avatar_iv_model: true,
      title: 'contento-ab-heygen',
      test: false,
    }),
  })
  const cjson = (await create.json()) as { data?: { video_id?: string }; error?: unknown }
  if (!create.ok || !cjson.data?.video_id) throw new Error(`HeyGen generate ${create.status}: ${JSON.stringify(cjson)}`)
  const videoId = cjson.data.video_id
  log(`HeyGen video_id=${videoId}, polling…`)
  return pollUntil('HeyGen', async () => {
    const s = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': process.env['HEYGEN_API_KEY']! },
    })
    const sj = (await s.json()) as { data?: { status?: string; video_url?: string; error?: unknown } }
    const st = sj.data?.status
    if (st === 'completed' && sj.data?.video_url) return { done: true, value: sj.data.video_url }
    if (st === 'failed') return { done: false, failed: JSON.stringify(sj.data?.error ?? 'failed') }
    return { done: false }
  })
}

// ── Sync.so refiner (video -> video, re-sync lips to audio) ──────────────────────
async function syncRefine(videoUrl: string, audioUrl: string, name: string): Promise<string> {
  const create = await fetch('https://api.sync.so/v2/generate', {
    method: 'POST',
    headers: { 'x-api-key': process.env['SYNC_API_KEY']!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'lipsync-2',
      input: [
        { type: 'video', url: videoUrl },
        { type: 'audio', url: audioUrl },
      ],
      options: { sync_mode: 'remap' },
      outputFileName: name,
    }),
  })
  const cj = (await create.json()) as { id?: string; error?: unknown }
  if (!create.ok || !cj.id) throw new Error(`Sync create ${create.status}: ${JSON.stringify(cj)}`)
  log(`Sync id=${cj.id}, polling…`)
  return pollUntil('Sync', async () => {
    const s = await fetch(`https://api.sync.so/v2/generate/${cj.id}`, {
      headers: { 'x-api-key': process.env['SYNC_API_KEY']! },
    })
    const sj = (await s.json()) as { status?: string; outputUrl?: string; error?: string }
    if (sj.status === 'COMPLETED' && sj.outputUrl) return { done: true, value: sj.outputUrl }
    if (sj.status === 'FAILED' || sj.status === 'REJECTED') return { done: false, failed: sj.error || sj.status }
    return { done: false }
  })
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const results: Array<{ arm: string; file?: string; sec?: number; estUsd?: string; note?: string }> = []

  // Step 1: ONE Russian audio (ElevenLabs), shared by both arms. Hosted on Higgsfield CDN
  // (a public URL HeyGen + Sync can also fetch), so no own public S3 is needed.
  if (!has('ELEVENLABS_API_KEY') || !has('HF_KEY_ID')) {
    throw new Error('Need ELEVENLABS_API_KEY (audio) and HF_KEY_ID/HF_KEY (CDN host + Higgsfield arm) to run a fair A/B.')
  }
  log('synthesizing RU voiceover (ElevenLabs)…')
  const mp3 = await synthesizeSpeech(RU_SCRIPT, process.env['ELEVENLABS_VOICE_ID'] ?? '')
  const wav = await transcodeMp3ToWav(mp3)
  const audioSec = wavDurationSec(wav)
  const audioUrl = await uploadToHiggsfield(wav, 'audio/x-wav')
  await writeFile(join(OUT_DIR, 'voiceover.wav'), wav)
  log(`audio ready: ${audioSec.toFixed(1)}s -> ${audioUrl}`)

  // Step 2: ONE character portrait (shared). Use AB_IMAGE_URL or generate via Higgsfield foundation.
  let imageUrl = process.env['AB_IMAGE_URL']
  if (!imageUrl) {
    log('generating shared character portrait (Higgsfield foundation)…')
    const portraitJob = await generateCharacterPortrait(CHARACTER, 'casual', 'female')
    imageUrl = await pollJobUntilDone(portraitJob)
  }
  log(`portrait: ${imageUrl}`)
  const imgResp = await fetch(imageUrl)
  const imgBytes = Buffer.from(await imgResp.arrayBuffer())
  const imgType = imgResp.headers.get('content-type') ?? 'image/jpeg'
  await writeFile(join(OUT_DIR, 'portrait.' + (imgType.includes('png') ? 'png' : 'jpg')), imgBytes)

  // Arm A — Higgsfield Speak
  let higgsUrl: string | undefined
  try {
    log('ARM A — Higgsfield Speak…')
    const job = await submitTalkingAvatarClip(imageUrl, audioUrl, CHARACTER, audioSec)
    higgsUrl = await pollJobUntilDone(job)
    const f = await download(higgsUrl, 'A_higgsfield.mp4')
    results.push({ arm: 'Higgsfield Speak', file: f, sec: audioSec, estUsd: `~$${(audioSec * 0.07).toFixed(2)} (speak, est)` })
  } catch (e) {
    results.push({ arm: 'Higgsfield Speak', note: `FAILED: ${e instanceof Error ? e.message : e}` })
  }

  // Arm B — HeyGen Avatar IV
  let heygenUrl: string | undefined
  if (has('HEYGEN_API_KEY')) {
    try {
      log('ARM B — HeyGen Avatar IV…')
      const tpId = await heygenUploadTalkingPhoto(imgBytes, imgType)
      heygenUrl = await heygenGenerate(tpId, audioUrl)
      const f = await download(heygenUrl, 'B_heygen.mp4')
      results.push({ arm: 'HeyGen Avatar IV', file: f, sec: audioSec, estUsd: `~$${(audioSec * 0.05).toFixed(2)} (avatar IV)` })
    } catch (e) {
      results.push({ arm: 'HeyGen Avatar IV', note: `FAILED: ${e instanceof Error ? e.message : e}` })
    }
  } else {
    results.push({ arm: 'HeyGen Avatar IV', note: 'skipped (no HEYGEN_API_KEY)' })
  }

  // Refiner — Sync.so on the chosen arm(s)
  if (has('SYNC_API_KEY') && REFINE !== 'none') {
    const targets: Array<[string, string | undefined]> = []
    if (REFINE === 'higgsfield' || REFINE === 'both') targets.push(['higgsfield', higgsUrl])
    if (REFINE === 'heygen' || REFINE === 'both') targets.push(['heygen', heygenUrl])
    for (const [src, url] of targets) {
      if (!url) { results.push({ arm: `Sync refiner (${src})`, note: 'skipped (source clip missing)' }); continue }
      try {
        log(`REFINER — Sync.so on ${src} clip…`)
        const out = await syncRefine(url, audioUrl, `refined_${src}`)
        const f = await download(out, `C_sync_${src}.mp4`)
        results.push({ arm: `Sync refiner (${src})`, file: f, sec: audioSec, estUsd: `~$${(audioSec * 0.05).toFixed(2)} (lipsync-2)` })
      } catch (e) {
        results.push({ arm: `Sync refiner (${src})`, note: `FAILED: ${e instanceof Error ? e.message : e}` })
      }
    }
  }

  // Summary
  console.log('\n──────── lipsync A/B results ────────')
  console.log(`script: "${RU_SCRIPT.slice(0, 60)}…"  audio ${audioSec.toFixed(1)}s`)
  console.log(`output dir: ${OUT_DIR}\n`)
  for (const r of results) {
    if (r.file) {
      const { size } = await stat(r.file)
      console.log(`✓ ${r.arm.padEnd(22)} ${(size / 1024).toFixed(0)} KB  ${r.estUsd ?? ''}  ${r.file}`)
    } else {
      console.log(`✗ ${r.arm.padEnd(22)} ${r.note ?? ''}`)
    }
  }
  console.log('\nScore each clip 1–5 on: lip-sync on hard consonants (вздрагивающий/счастье/учишься),')
  console.log('mouth/teeth artifacts, facial naturalness, cross-shot stability, and $/clip.')
}

main().catch(e => {
  console.error('[ab] fatal:', e)
  process.exit(1)
})
