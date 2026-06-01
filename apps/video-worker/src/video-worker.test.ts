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

const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
const mockFindMany = vi.fn()

vi.mock('@contento/db', () => ({
  prisma: {
    videoShot: {
      findFirst: mockFindFirst,
      update: mockUpdate,
      findMany: mockFindMany,
    },
    videoJob: {
      update: mockUpdate,
    },
  },
}))

// Mock fetch for clip download
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockUploadBuffer = vi.fn()
vi.mock('./s3-client.js', () => ({
  uploadBuffer: mockUploadBuffer,
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
