import { Worker, Queue } from 'bullmq'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { prisma } from '@contento/db'
import {
  generateVideoStoryboard,
  synthesizeSpeechWithTimestamps,
  wavDurationSec,
  isMockMode,
  MOCK_CLIP_URL,
  createVideoProvider,
} from '@contento/ai'
import type { WordTiming } from '@contento/ai'
import { stitchClips, transcodeMp3ToWav, probeDurationSec } from './stitch.js'
import { uploadVideo, uploadBuffer, downloadBuffer, keyFromUrl, presignGetUrl, isOwnS3Url, redactSignedUrls } from './s3-client.js'
import { renderStitchVideo } from './remotion-stitch.js'
import { buildStitchProps, parseSubtitlesJson, type StitchShotInput } from './stitch-props.js'

export interface VideoJobPayload {
  videoJobId: string
  scriptId: string
  workspaceId: string
  language: string
  /** Optional override; otherwise resolved from AvatarPersona, then env. */
  soulId?: string
  platform?: string | null
}

export interface StitchJobPayload {
  videoJobId: string
}

export function createWorker(redisUrl: string) {
  const connection = { url: redisUrl }
  const queue = new Queue<VideoJobPayload | StitchJobPayload>('video', { connection: { url: redisUrl } })

  const enqueueStitch = async (videoJobId: string) => {
    await queue.add('stitch', { videoJobId } satisfies StitchJobPayload, { jobId: `stitch-${videoJobId}` })
  }

  const worker = new Worker<VideoJobPayload | StitchJobPayload>(
    'video',
    async (job) => {
      if (job.name === 'stitch') {
        return handleStitch(job.data as StitchJobPayload)
      }
      return handleGenerate(job.data as VideoJobPayload, enqueueStitch)
    },
    { connection, concurrency: 2 },
  )

  return { worker, queue }
}

/**
 * A campaign render job is orphaned once the user presses Stop: the owning content-plan
 * item's plan leaves IN_PRODUCTION. Standalone (non-campaign) jobs have no owning item
 * and always run. Returns true if this job should abort to avoid wasting render credits.
 */
async function isCampaignJobCancelled(videoJobId: string): Promise<boolean> {
  const item = await prisma.contentPlanItem.findFirst({
    where: { videoJobId },
    select: { contentPlan: { select: { status: true } } },
  })
  return item != null && item.contentPlan.status !== 'IN_PRODUCTION'
}

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

async function handleGenerate(
  { videoJobId, scriptId, workspaceId, language, soulId: payloadSoulId, platform }: VideoJobPayload,
  enqueueStitch: (id: string) => Promise<void>,
) {
  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'STORYBOARDING' } })

  const script = await prisma.script.findUnique({ where: { id: scriptId } })
  if (!script) throw new Error(`Script ${scriptId} not found`)

  // Bail before the (token-consuming) storyboard if the campaign was already stopped.
  if (await isCampaignJobCancelled(videoJobId)) {
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: 'Cancelled: campaign generation stopped' },
    })
    return
  }

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
  }, { language, ...(characterDescription ? { characterDescription } : {}), ...(platform ? { platform } : {}) })

  await prisma.script.update({ where: { id: scriptId }, data: { storyboard: shots } })

  await prisma.videoShot.createMany({
    data: shots.map(s => ({
      videoJobId,
      index: s.index,
      prompt: s.prompt,
      dialogue: s.dialogue ?? null,
      durationSec: s.durationSec,
      shotType: s.shotType ?? 'avatar',
      ...(s.headline ? { headline: s.headline } : {}),
      ...(s.screencastContent ? { screencastTemplate: s.screencastContent.template, screencastContent: s.screencastContent } : {}),
      status: 'PENDING' as const,
    })),
  })

  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'RENDERING_SHOTS' } })

  const shotRows = await prisma.videoShot.findMany({
    where: { videoJobId },
    orderBy: { index: 'asc' },
  })

  const voiceId = process.env['ELEVENLABS_VOICE_ID'] ?? ''
  const mock = isMockMode()
  const seed = jobSeed(videoJobId)
  const provider = createVideoProvider()

  // Word timings per shot, persisted to Script.subtitles for the Remotion
  // stitch to burn in subtitles. Shape: { version: 1, shots: ShotTimingJson[] }
  const shotTimings: Array<{ index: number; audioSec: number; words: WordTiming[] }> = []

  // All screencast shots in a job share the workspace's newest uploaded recording (if any),
  // resolved once here rather than per-shot. null => synthetic screens from screencastContent.
  const screencastRecordingUrl =
    !mock && shotRows.some((s) => (s.shotType ?? 'avatar') === 'screencast')
      ? (await prisma.asset.findFirst({ where: { workspaceId, kind: 'SCREENCAST' }, orderBy: { createdAt: 'desc' } }))?.url ?? null
      : null

  let cancelled = false
  for (const shot of shotRows) {
    // Abort between shots if the campaign was stopped, to stop burning render credits.
    if (await isCampaignJobCancelled(videoJobId)) { cancelled = true; break }
    await prisma.videoShot.update({ where: { id: shot.id }, data: { status: 'SUBMITTED' } })
    try {
      let clipUrl: string | null = null
      let shotAudioUrl: string | null = null
      const shotType = shot.shotType ?? 'avatar'
      const effectiveType = shotType === 'broll' ? 'broll' : shotType === 'screencast' ? 'screencast' : 'avatar'

      if (mock) {
        // Skip all external calls — use stable placeholder clip
        clipUrl = MOCK_CLIP_URL
      } else {
        if (effectiveType === 'screencast') {
          // No Higgsfield clip: synth screen is rendered at stitch time. Generate voiceover only.
          if (shot.dialogue) {
            const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
            const audioSec = wavDurationSec(await transcodeMp3ToWav(tts.audio))
            // Remotion plays this over the synthetic screencast, so it lives on OUR S3 (mp3 is fine for <Audio>).
            const audioKey = `videos/shots/${videoJobId}/${shot.id}.mp3`
            shotAudioUrl = await uploadBuffer(tts.audio, audioKey, 'audio/mpeg')
            shotTimings.push({ index: shot.index, audioSec, words: tts.words })
          }
          // Optional uploaded screen recording backs the shot as a real clip; else synthetic.
          clipUrl = screencastRecordingUrl // null => synthetic screen rendered from screencastContent
        } else if (effectiveType === 'broll') {
          // B-ROLL: voiceover plays over a silent generated scene (no talking head).
          let audioSec = 0
          if (shot.dialogue) {
            const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
            audioSec = wavDurationSec(await transcodeMp3ToWav(tts.audio))
            // Remotion plays this over the silent visual, so it lives on OUR S3 (mp3 is fine for <Audio>).
            const audioKey = `videos/shots/${videoJobId}/${shot.id}.mp3`
            shotAudioUrl = await uploadBuffer(tts.audio, audioKey, 'audio/mpeg')
            shotTimings.push({ index: shot.index, audioSec, words: tts.words })
          }
          // Foundation scene still (no Soul) → silent DoP motion clip.
          const sceneImageUrl = await provider.sceneFrame(shot.prompt, { seed })
          const higgsfieldClipUrl = await provider.motionFromImage({ imageUrl: sceneImageUrl, prompt: shot.prompt, seed })
          const clipResp = await fetch(higgsfieldClipUrl)
          if (!clipResp.ok) throw new Error(`Failed to fetch clip: ${clipResp.status}`)
          const clipBuf = Buffer.from(await clipResp.arrayBuffer())
          const clipKey = `videos/shots/${videoJobId}/${shot.id}.mp4`
          clipUrl = await uploadBuffer(clipBuf, clipKey, 'video/mp4')
        } else {
          // AVATAR: unchanged Soul → Speak/DoP path (audio baked into the clip).
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
            const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
            const mp3Buffer = tts.audio
            const wavBuffer = await transcodeMp3ToWav(mp3Buffer)
            audioSec = wavDurationSec(wavBuffer)
            // Speak fetches the audio itself, so it must live on Higgsfield's CDN —
            // our private/local S3 URL would be unreachable (-> invalid_audio_format).
            // Higgsfield's upload endpoint requires the MIME 'audio/x-wav' for WAV.
            audioUrl = await provider.uploadAudio(wavBuffer, 'audio/x-wav')
            shotTimings.push({ index: shot.index, audioSec, words: tts.words })
          }

          // Step 2: character image (provider hides submit+poll)
          const imageUrl = await provider.characterFrame(shot.prompt, { characterId: soulId, seed })

          // Step 3: talking avatar (has dialogue) or silent motion clip (no dialogue)
          const higgsfieldClipUrl = audioUrl
            ? await provider.talkingHead({ imageUrl, audioUrl, prompt: shot.prompt, audioDurationSec: audioSec })
            : await provider.motionFromImage({ imageUrl, prompt: shot.prompt, seed })

          // Step 5: download from Higgsfield CDN and re-upload to our S3
          const clipResp = await fetch(higgsfieldClipUrl)
          if (!clipResp.ok) throw new Error(`Failed to fetch clip: ${clipResp.status}`)
          const clipBuf = Buffer.from(await clipResp.arrayBuffer())
          const clipKey = `videos/shots/${videoJobId}/${shot.id}.mp4`
          clipUrl = await uploadBuffer(clipBuf, clipKey, 'video/mp4')
        }
      }

      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'DONE', clipUrl, ...(shotAudioUrl ? { audioUrl: shotAudioUrl } : {}) },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'FAILED', errorMessage: msg },
      })
    }
  }

  if (cancelled) {
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: 'Cancelled: campaign generation stopped' },
    })
    return
  }

  if (shotTimings.length > 0) {
    await prisma.script.update({
      where: { id: scriptId },
      data: { subtitles: { version: 1, shots: shotTimings } as object },
    }).catch(err => {
      // Subtitles are an enhancement — never fail the whole job over them.
      console.error(`[video-worker] failed to persist subtitles for script ${scriptId}:`, err)
    })
  }

  // After all shots: check results and either stitch or fail the job
  const finalShots = await prisma.videoShot.findMany({ where: { videoJobId } })
  const anyFailed = finalShots.some(s => s.status === 'FAILED')

  if (anyFailed) {
    const details = finalShots
      .filter(s => s.status === 'FAILED')
      .map(s => `shot[${s.index}]: ${s.errorMessage ?? 'unknown'}`)
      .join('; ')
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: `One or more shots failed — ${details}` },
    })
  } else {
    await enqueueStitch(videoJobId)
  }
}

export async function handleStitch({ videoJobId }: StitchJobPayload) {
  // Atomic claim: both the worker's inline path and the webhook path can enqueue
  // a stitch for the same job. Only the run that flips RENDERING_SHOTS → STITCHING
  // proceeds; the loser sees count 0 and exits without double-stitching.
  // STITCHING itself is also claimable so a BullMQ stall-retry can resume a stitch
  // that crashed mid-run instead of orphaning the job in STITCHING forever.
  const claimed = await prisma.videoJob.updateMany({
    where: { id: videoJobId, status: { in: ['RENDERING_SHOTS', 'STITCHING'] } },
    data: { status: 'STITCHING' },
  })
  if (claimed.count === 0) return

  const clipPaths: string[] = []
  let outputPath: string | undefined
  try {
    const shots = await prisma.videoShot.findMany({
      where: { videoJobId, status: 'DONE' },
      orderBy: { index: 'asc' },
    })

    if (shots.length === 0) {
      await prisma.videoJob.update({
        where: { id: videoJobId },
        data: { status: 'FAILED', errorMessage: 'No completed shots to stitch' },
      })
      return
    }

    const videoJob = await prisma.videoJob.findUnique({
      where: { id: videoJobId },
      include: { script: true },
    })
    if (!videoJob) throw new Error(`VideoJob ${videoJobId} not found`)

    outputPath = join(tmpdir(), `video-${videoJobId}.mp4`)
    const stitcher = process.env['VIDEO_STITCHER'] ?? 'remotion'

    if (stitcher === 'remotion') {
      // Remotion path: clips stay in S3 and are fetched by the renderer via
      // presigned URLs; durations come from ffprobe; subtitles from the
      // timings persisted by handleGenerate.
      const subtitles = parseSubtitlesJson(videoJob.script.subtitles)
      const visual = await prisma.visualIdentity.findUnique({
        where: { workspaceId: videoJob.workspaceId },
      })
      const shotInputs: StitchShotInput[] = []
      for (const shot of shots) {
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        // Mock clips are public external URLs — pass through unsigned.
        const src = isOwnS3Url(shot.clipUrl) ? await presignGetUrl(keyFromUrl(shot.clipUrl)) : shot.clipUrl
        const clipProbedSec = await probeDurationSec(src)
        const timing = subtitles?.shots.find((s) => s.index === shot.index)
        if (shot.audioUrl) {
          // b-roll: voiceover drives the shot duration; the silent clip loops underneath.
          const audioSrc = isOwnS3Url(shot.audioUrl) ? await presignGetUrl(keyFromUrl(shot.audioUrl)) : shot.audioUrl
          const voiceSec = timing?.audioSec ?? clipProbedSec
          shotInputs.push({
            src,
            probedSec: voiceSec,
            clipProbedSec,
            audioSrc,
            ...(shot.headline ? { headline: shot.headline } : {}),
            ...(timing ? { timing } : {}),
          })
        } else {
          // avatar: clip carries its own audio; duration = clip length (unchanged behavior).
          shotInputs.push({ src, probedSec: clipProbedSec, ...(timing ? { timing } : {}) })
        }
      }
      const logoUrl = visual?.logoUrl
        ? (isOwnS3Url(visual.logoUrl) ? await presignGetUrl(keyFromUrl(visual.logoUrl)) : visual.logoUrl)
        : null
      const props = buildStitchProps({
        shots: shotInputs,
        cta: videoJob.script.cta,
        visual: visual ? { ...visual, logoUrl } : null,
      })
      await renderStitchVideo(props, outputPath)
    } else {
      // Legacy ffmpeg concat fallback (VIDEO_STITCHER=ffmpeg).
      for (const shot of shots) {
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        // Read clips with authenticated S3 (the bucket is private — an anonymous
        // HTTP GET returns 403, which previously stalled the job at STITCHING).
        const buf = await downloadBuffer(keyFromUrl(shot.clipUrl))
        const localPath = join(tmpdir(), `shot-${shot.id}.mp4`)
        await writeFile(localPath, buf)
        clipPaths.push(localPath)
      }
      await stitchClips({ clipPaths, outputPath })
    }

    const key = `videos/${videoJob.workspaceId}/${videoJob.scriptId}/${videoJobId}.mp4`
    const outputUrl = await uploadVideo(outputPath, key)

    await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'DONE', outputUrl } })

    return { outputUrl }
  } catch (err) {
    // Fail fast so the producer's poll sees FAILED instead of waiting out the
    // 45-min timeout while the job sits in STITCHING. Redact presigned-URL
    // signatures so they never persist into VideoJob.errorMessage.
    const msg = redactSignedUrls(err instanceof Error ? err.message : String(err))
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: `Stitch failed: ${msg}` },
    }).catch(() => {})
    throw err
  } finally {
    for (const p of clipPaths) await unlink(p).catch(() => {})
    if (outputPath) await unlink(outputPath).catch(() => {})
  }
}
