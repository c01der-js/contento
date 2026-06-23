import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { getVideoQueue } from '../queue.js'
import { getObjectStream, keyFromUrl } from '../lib/s3.js'
import { runQaChecks, type QaInput } from '../qa/checks.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })
const JobParams = z.object({ workspaceId: z.string(), jobId: z.string() })
const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
})

const ErrorResponse = z.object({ error: z.string() })

const VideoShotResponse = z.object({
  id: z.string(),
  index: z.number(),
  prompt: z.string(),
  dialogue: z.string().nullable(),
  durationSec: z.number(),
  status: z.string(),
  higgsfieldJobId: z.string().nullable(),
  clipUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
})

const VideoCreateBody = z.object({
  language: z.string().min(2).max(8).optional().default('ru'),
})

const QaFindingResponse = z.object({
  id: z.string(),
  severity: z.string(),
  message: z.string(),
})
const QaResponse = z.object({
  status: z.string(), // PASS | WARN | BLOCK
  findings: z.array(QaFindingResponse),
})

const VideoJobResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scriptId: z.string(),
  status: z.string(),
  aspectRatio: z.string(),
  language: z.string(),
  outputUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  shots: z.array(VideoShotResponse).optional(),
  // Auto QA verdict, computed live for finished jobs (DONE). Null while generating.
  qa: QaResponse.nullable().optional(),
})

const VideoJobListResponse = z.object({
  items: z.array(VideoJobResponse),
  nextCursor: z.string().nullable(),
})

function serializeShot(s: {
  id: string; index: number; prompt: string; dialogue: string | null
  durationSec: number; status: string; higgsfieldJobId: string | null
  clipUrl: string | null; errorMessage: string | null
}) {
  return { ...s }
}

function serializeJob(job: {
  id: string; workspaceId: string; scriptId: string; status: string
  aspectRatio: string; language: string; outputUrl: string | null; errorMessage: string | null
  createdAt: Date; updatedAt: Date
}, shots?: ReturnType<typeof serializeShot>[], qa?: { status: string; findings: { id: string; severity: string; message: string }[] } | null) {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    scriptId: job.scriptId,
    status: job.status,
    aspectRatio: job.aspectRatio,
    language: job.language,
    outputUrl: job.outputUrl,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    shots,
    qa: qa ?? null,
  }
}

export const videoRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /scripts/:scriptId/video — create a video generation job
  app.post('/scripts/:scriptId/video', {
    schema: {
      params: ScriptParams,
      body: VideoCreateBody,
      response: {
        201: VideoJobResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { language } = request.body

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Script not found' })

    const videoJob = await prisma.videoJob.create({
      data: { workspaceId, scriptId, status: 'PENDING', language },
    })

    try {
      const queue = getVideoQueue()
      await queue.add('generate', {
        videoJobId: videoJob.id,
        scriptId,
        workspaceId,
        language,
      })
    } catch (e) {
      await prisma.videoJob.delete({ where: { id: videoJob.id } }).catch(() => {})
      throw e
    }

    return reply.status(201).send(serializeJob(videoJob))
  })

  // GET /video-jobs/:jobId — poll job + shots
  app.get('/video-jobs/:jobId', {
    schema: {
      params: JobParams,
      response: {
        200: VideoJobResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, jobId } = request.params

    const job = await prisma.videoJob.findFirst({
      where: { id: jobId, workspaceId },
      include: {
        shots: { orderBy: { index: 'asc' } },
        script: { select: { subtitles: true } },
      },
    })

    if (!job) return reply.status(404).send({ error: 'Video job not found' })

    // Surface the same auto-QA verdict the campaign gate uses, in the standalone create
    // flow too. Computed live (pure, no IO) once the job is finished; null while generating.
    const qa =
      job.status === 'DONE'
        ? runQaChecks({
            platform: job.platform,
            outputUrl: job.outputUrl,
            jobStatus: job.status,
            shots: job.shots.map((s) => ({
              index: s.index,
              durationSec: s.durationSec,
              dialogue: s.dialogue,
              status: s.status,
            })),
            subtitles: (job.script.subtitles as unknown as QaInput['subtitles']) ?? null,
          })
        : null

    return reply.status(200).send(serializeJob(job, job.shots.map(serializeShot), qa))
  })

  // GET /video-jobs/:jobId/output — stream the rendered MP4 from private storage.
  // Auth accepts a ?token= query param (see plugins/auth.ts) so a browser <video src>
  // can play it. Honors HTTP Range for seeking.
  app.get('/video-jobs/:jobId/output', {
    schema: {
      params: JobParams,
      querystring: z.object({ token: z.string().optional() }),
      response: { 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, jobId } = request.params

    const job = await prisma.videoJob.findFirst({
      where: { id: jobId, workspaceId },
      select: { outputUrl: true, status: true },
    })
    if (!job) return reply.status(404).send({ error: 'Video job not found' })
    if (!job.outputUrl) return reply.status(409).send({ error: `Video not ready (status ${job.status})` })

    let obj
    try {
      obj = await getObjectStream(keyFromUrl(job.outputUrl), request.headers.range)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(404).send({ error: `Failed to read video: ${msg}` })
    }

    // Stream raw (bypassing the JSON serializer) with proper status (200/206) + headers.
    const headers: Record<string, string> = {
      'Content-Type': obj.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    }
    if (obj.contentLength != null) headers['Content-Length'] = String(obj.contentLength)
    if (obj.contentRange) headers['Content-Range'] = obj.contentRange

    reply.hijack()
    reply.raw.writeHead(obj.statusCode, headers)
    obj.body.on('error', () => reply.raw.destroy())
    obj.body.pipe(reply.raw)
  })

  // GET /video-jobs — library list with cursor pagination
  app.get('/video-jobs', {
    schema: {
      params: WorkspaceParams,
      querystring: ListQuery,
      response: {
        200: VideoJobListResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { limit, cursor } = request.query

    const jobs = await prisma.videoJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = jobs.length > limit
    const items = hasMore ? jobs.slice(0, limit) : jobs
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null

    return reply.status(200).send({
      items: items.map(j => serializeJob(j)),
      nextCursor,
    })
  })
}
