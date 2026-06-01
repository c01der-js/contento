import { Worker, Queue } from 'bullmq'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { prisma } from '@contento/db'
import {
  generateVideoStoryboard,
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  synthesizeSpeech,
  isMockMode,
  MOCK_CLIP_URL,
} from '@contento/ai'
import { stitchClips } from './stitch.js'
import { uploadVideo, uploadBuffer } from './s3-client.js'

export interface VideoJobPayload {
  videoJobId: string
  scriptId: string
  workspaceId: string
  language: string
}

export interface StitchJobPayload {
  videoJobId: string
}

export function createWorker(redisUrl: string) {
  const connection = { url: redisUrl }
  const queue = new Queue<VideoJobPayload | StitchJobPayload>('video', { connection: { url: redisUrl } })

  const enqueueStitch = async (videoJobId: string) => {
    await queue.add('stitch', { videoJobId } satisfies StitchJobPayload)
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

async function handleGenerate(
  { videoJobId, scriptId, workspaceId, language }: VideoJobPayload,
  enqueueStitch: (id: string) => Promise<void>,
) {
  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'STORYBOARDING' } })

  const script = await prisma.script.findUnique({ where: { id: scriptId } })
  if (!script) throw new Error(`Script ${scriptId} not found`)

  const shots = await generateVideoStoryboard(workspaceId, {
    hook: script.hook,
    body: script.body,
    cta: script.cta,
  }, { language })

  await prisma.script.update({ where: { id: scriptId }, data: { storyboard: shots } })

  await prisma.videoShot.createMany({
    data: shots.map(s => ({
      videoJobId,
      index: s.index,
      prompt: s.prompt,
      dialogue: s.dialogue ?? null,
      durationSec: s.durationSec,
      status: 'PENDING' as const,
    })),
  })

  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'RENDERING_SHOTS' } })

  const shotRows = await prisma.videoShot.findMany({
    where: { videoJobId },
    orderBy: { index: 'asc' },
  })

  const soulId = process.env['HIGGSFIELD_SOUL_ID'] ?? ''
  const voiceId = process.env['ELEVENLABS_VOICE_ID'] ?? ''
  const mock = isMockMode()

  for (const shot of shotRows) {
    await prisma.videoShot.update({ where: { id: shot.id }, data: { status: 'SUBMITTED' } })
    try {
      let clipUrl: string

      if (mock) {
        // Skip all external calls — use stable placeholder clip
        clipUrl = MOCK_CLIP_URL
      } else {
        // Step 1: ElevenLabs TTS (only if the shot has spoken dialogue)
        let audioUrl: string | undefined
        if (shot.dialogue) {
          const wavBuffer = await synthesizeSpeech(shot.dialogue, voiceId)
          const audioKey = `videos/audio/${videoJobId}/${shot.id}.wav`
          audioUrl = await uploadBuffer(wavBuffer, audioKey, 'audio/wav')
        }

        // Step 2: Higgsfield Soul Character → character image
        const charRequestId = await submitSoulCharacterFrame(shot.prompt, soulId)
        const imageUrl = await pollJobUntilDone(charRequestId)

        // Step 3a: talking avatar with lip-sync (has dialogue + audio)
        // Step 3b: silent motion video via DoP Lite (no dialogue)
        let videoRequestId: string
        if (audioUrl) {
          videoRequestId = await submitTalkingAvatarClip(imageUrl, audioUrl, shot.prompt)
        } else {
          videoRequestId = await submitImageToVideo(imageUrl, shot.prompt)
        }

        // Step 4: poll until clip is ready
        const higgsfieldClipUrl = await pollJobUntilDone(videoRequestId)

        // Step 5: download from Higgsfield CDN and re-upload to our S3
        const clipResp = await fetch(higgsfieldClipUrl)
        if (!clipResp.ok) throw new Error(`Failed to fetch clip: ${clipResp.status}`)
        const clipBuf = Buffer.from(await clipResp.arrayBuffer())
        const clipKey = `videos/shots/${videoJobId}/${shot.id}.mp4`
        clipUrl = await uploadBuffer(clipBuf, clipKey, 'video/mp4')
      }

      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'DONE', clipUrl },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.videoShot.update({
        where: { id: shot.id },
        data: { status: 'FAILED', errorMessage: msg },
      })
    }
  }

  // After all shots: check results and either stitch or fail the job
  const finalShots = await prisma.videoShot.findMany({ where: { videoJobId } })
  const anyFailed = finalShots.some(s => s.status === 'FAILED')

  if (anyFailed) {
    await prisma.videoJob.update({
      where: { id: videoJobId },
      data: { status: 'FAILED', errorMessage: 'One or more shots failed' },
    })
  } else {
    await enqueueStitch(videoJobId)
  }
}

async function handleStitch({ videoJobId }: StitchJobPayload) {
  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'STITCHING' } })

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

  const videoJob = await prisma.videoJob.findUnique({ where: { id: videoJobId } })
  if (!videoJob) throw new Error(`VideoJob ${videoJobId} not found`)

  const clipPaths: string[] = []
  try {
    for (const shot of shots) {
      if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
      const resp = await fetch(shot.clipUrl)
      if (!resp.ok) throw new Error(`Failed to fetch clip ${shot.clipUrl}: ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      const localPath = join(tmpdir(), `shot-${shot.id}.mp4`)
      await writeFile(localPath, buf)
      clipPaths.push(localPath)
    }

    const outputPath = join(tmpdir(), `video-${videoJobId}.mp4`)
    await stitchClips({ clipPaths, outputPath })

    const key = `videos/${videoJob.workspaceId}/${videoJob.scriptId}/${videoJobId}.mp4`
    const outputUrl = await uploadVideo(outputPath, key)

    await unlink(outputPath).catch(() => {})
    await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: 'DONE', outputUrl } })

    return { outputUrl }
  } finally {
    for (const p of clipPaths) await unlink(p).catch(() => {})
  }
}
