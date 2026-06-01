import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { getVideoQueue } from '../queue.js'

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
}, shots?: ReturnType<typeof serializeShot>[]) {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    shots,
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
      include: { shots: { orderBy: { index: 'asc' } } },
    })

    if (!job) return reply.status(404).send({ error: 'Video job not found' })

    return reply.status(200).send(serializeJob(job, job.shots.map(serializeShot)))
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
