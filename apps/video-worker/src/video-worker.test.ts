import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildConcatArgs } from './stitch.js'

// ─── stitch: buildConcatArgs ─────────────────────────────────────────────────

describe('buildConcatArgs', () => {
  it('returns correct ffmpeg argument list', () => {
    const args = buildConcatArgs(
      ['/tmp/a.mp4', '/tmp/b.mp4'],
      '/tmp/concat.txt',
      '/tmp/output.mp4',
    )
    expect(args[0]).toBe('-f')
    expect(args[1]).toBe('concat')
    expect(args).toContain('/tmp/concat.txt')
    expect(args[args.length - 1]).toBe('/tmp/output.mp4')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
  })
})

// ─── webhook handler: state transitions ──────────────────────────────────────

const {
  mockFindFirst,
  mockUpdate,
  mockFindMany,
  mockJobUpdateMany,
  mockJobFindUnique,
  mockVisualFindUnique,
  mockUploadBuffer,
  mockUploadVideo,
  mockRenderStitch,
  mockProbeDuration,
  mockFetch,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
  mockJobUpdateMany: vi.fn(),
  mockJobFindUnique: vi.fn(),
  mockVisualFindUnique: vi.fn(),
  mockUploadBuffer: vi.fn(),
  mockUploadVideo: vi.fn(),
  mockRenderStitch: vi.fn(),
  mockProbeDuration: vi.fn(),
  mockFetch: vi.fn(),
}))

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
      findUnique: mockJobFindUnique,
    },
    avatarPersona: { findUnique: vi.fn() },
    contentPlanItem: { findFirst: vi.fn() },
    script: { findUnique: vi.fn(), update: vi.fn() },
    visualIdentity: { findUnique: mockVisualFindUnique },
  },
}))

vi.stubGlobal('fetch', mockFetch)

vi.mock('./s3-client.js', () => ({
  uploadBuffer: mockUploadBuffer,
  uploadVideo: mockUploadVideo,
  downloadBuffer: vi.fn(),
  keyFromUrl: vi.fn((u: string) => u),
  presignGetUrl: vi.fn(async (key: string) => `http://presigned/${key}`),
  isOwnS3Url: vi.fn(() => true),
  redactSignedUrls: vi.fn((s: string) => s),
}))

vi.mock('./remotion-stitch.js', () => ({ renderStitchVideo: mockRenderStitch }))

// Partial mock: keep buildConcatArgs/stitchClips real (used elsewhere), stub the
// ffprobe-spawning probeDurationSec so the Remotion happy path doesn't shell out.
vi.mock('./stitch.js', async (importActual) => {
  const actual = await importActual<typeof import('./stitch.js')>()
  return { ...actual, probeDurationSec: mockProbeDuration }
})

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
  synthesizeSpeechWithTimestamps: vi.fn(async () => ({ audio: Buffer.alloc(8), words: [] })),
  uploadToHiggsfield: vi.fn(),
  wavDurationSec: vi.fn(() => 3),
  isMockMode: () => true,
  MOCK_CLIP_URL: 'https://example.com/mock.mp4',
  createVideoProvider: () => ({
    uploadAudio: vi.fn(),
    characterFrame: vi.fn(),
    talkingHead: vi.fn(),
    motionFromImage: vi.fn(),
  }),
}))

import { handleHiggsfieldWebhook } from './webhook-handler.js'
import type { HiggsfieldWebhookPayload } from '@contento/ai'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleHiggsfieldWebhook', () => {
  const enqueueStitch = vi.fn()
  const deps = { enqueueStitch }

  it('ignores unknown job_id', async () => {
    mockFindFirst.mockResolvedValue(null)
    await handleHiggsfieldWebhook(
      { job_id: 'unknown', status: 'completed', output_url: 'http://x/clip.mp4' },
      deps,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('is idempotent: ignores duplicate webhook for DONE shot', async () => {
    mockFindFirst.mockResolvedValue({ id: 's1', videoJobId: 'vj1', status: 'DONE' })
    await handleHiggsfieldWebhook(
      { job_id: 'hf-1', status: 'completed', output_url: 'http://x/clip.mp4' },
      deps,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(enqueueStitch).not.toHaveBeenCalled()
  })

  it('is idempotent: ignores duplicate webhook for FAILED shot', async () => {
    mockFindFirst.mockResolvedValue({ id: 's1', videoJobId: 'vj1', status: 'FAILED' })
    await handleHiggsfieldWebhook(
      { job_id: 'hf-1', status: 'failed' },
      deps,
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('marks shot FAILED when Higgsfield reports failure', async () => {
    mockFindFirst.mockResolvedValue({ id: 's1', videoJobId: 'vj1', status: 'SUBMITTED' })
    mockFindMany.mockResolvedValue([
      { status: 'SUBMITTED' },  // still pending (shouldn't finalize yet for this test)
    ])
    await handleHiggsfieldWebhook(
      { job_id: 'hf-1', status: 'failed', error: 'quota exceeded' },
      deps,
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'quota exceeded' }),
      }),
    )
  })

  it('marks shot DONE and enqueues stitch when all shots complete', async () => {
    mockFindFirst.mockResolvedValue({ id: 's1', videoJobId: 'vj1', status: 'SUBMITTED' })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('fake-video').buffer,
    })
    mockUploadBuffer.mockResolvedValue('http://minio/renders/videos/shots/vj1/s1.mp4')
    // After update, all shots are terminal
    mockFindMany.mockResolvedValue([{ status: 'DONE' }])

    const payload: HiggsfieldWebhookPayload = {
      job_id: 'hf-1',
      status: 'completed',
      output_url: 'https://higgsfield.ai/clips/hf-1.mp4',
    }
    await handleHiggsfieldWebhook(payload, deps)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'DONE' }),
      }),
    )
    expect(enqueueStitch).toHaveBeenCalledWith('vj1')
  })

  it('marks VideoJob FAILED when any shot is FAILED after all are terminal', async () => {
    mockFindFirst.mockResolvedValue({ id: 's2', videoJobId: 'vj2', status: 'SUBMITTED' })
    mockFindMany.mockResolvedValue([
      { status: 'DONE' },
      { status: 'FAILED' },
    ])
    await handleHiggsfieldWebhook(
      { job_id: 'hf-2', status: 'failed', error: 'timeout' },
      deps,
    )
    expect(enqueueStitch).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vj2' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })
})

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
      where: { id: 'vj-claimed', status: { in: ['RENDERING_SHOTS', 'STITCHING'] } },
      data: { status: 'STITCHING' },
    })
    // claim failed -> no shot lookup, no S3, no ffmpeg
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('marks the job FAILED when the claim succeeds but no shots are DONE', async () => {
    mockJobUpdateMany.mockResolvedValue({ count: 1 })
    mockFindMany.mockResolvedValue([])
    await handleStitch({ videoJobId: 'vj-empty' })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'vj-empty' },
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'No completed shots to stitch' }),
      }),
    )
  })

  it('renders via Remotion (default stitcher) and marks the job DONE with the uploaded outputUrl', async () => {
    const prev = process.env['VIDEO_STITCHER']
    delete process.env['VIDEO_STITCHER'] // default -> 'remotion'
    try {
      mockJobUpdateMany.mockResolvedValue({ count: 1 })
      mockFindMany.mockResolvedValue([
        { id: 'shot-0', index: 0, clipUrl: 'http://minio/renders/videos/shots/vj-ok/shot-0.mp4' },
      ])
      mockJobFindUnique.mockResolvedValue({
        id: 'vj-ok',
        workspaceId: 'ws1',
        scriptId: 'sc1',
        script: {
          cta: 'Подпишись',
          subtitles: {
            version: 1,
            shots: [{ index: 0, audioSec: 2, words: [{ text: 'привет', startSec: 0, endSec: 1 }] }],
          },
        },
      })
      mockVisualFindUnique.mockResolvedValue({
        primaryColor: '#111111',
        secondaryColor: null,
        accentColor: '#ff0000',
        logoUrl: null,
      })
      mockProbeDuration.mockResolvedValue(5)
      mockUploadVideo.mockResolvedValue('http://minio/renders/videos/ws1/sc1/vj-ok.mp4')

      await handleStitch({ videoJobId: 'vj-ok' })

      expect(mockProbeDuration).toHaveBeenCalledTimes(1)
      expect(mockRenderStitch).toHaveBeenCalledTimes(1)
      const [props] = mockRenderStitch.mock.calls[0]!
      expect(props.cta).toBe('Подпишись')
      expect(props.primaryColor).toBe('#111111')
      // own-S3 clip -> presigned src passed to the renderer
      expect(props.shots[0].src).toBe('http://presigned/http://minio/renders/videos/shots/vj-ok/shot-0.mp4')
      expect(props.shots[0].chunks.length).toBeGreaterThan(0) // subtitles joined by index
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vj-ok' },
          data: expect.objectContaining({
            status: 'DONE',
            outputUrl: 'http://minio/renders/videos/ws1/sc1/vj-ok.mp4',
          }),
        }),
      )
    } finally {
      if (prev === undefined) delete process.env['VIDEO_STITCHER']
      else process.env['VIDEO_STITCHER'] = prev
    }
  })
})
