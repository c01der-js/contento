import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { TOPIC_LORA } from '@contento/shared'
import { requireRole } from '../middleware/rbac.js'
import { getKafkaProducer } from '../kafka-producer.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const LoraJobResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  status: z.string(),
  assetPrefix: z.string(),
  weightsUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
})

function serializeLoraJob(j: {
  id: string
  workspaceId: string
  status: string
  assetPrefix: string
  weightsUrl: string | null
  errorMessage: string | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
}) {
  return {
    id: j.id,
    workspaceId: j.workspaceId,
    status: j.status,
    assetPrefix: j.assetPrefix,
    weightsUrl: j.weightsUrl,
    errorMessage: j.errorMessage,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    createdAt: j.createdAt.toISOString(),
  }
}

export const loraRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/lora-jobs', {
    schema: {
      params: WorkspaceParams,
      body: z.object({ assetPrefix: z.string().min(1) }),
      response: {
        201: LoraJobResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { assetPrefix } = request.body

    const job = await prisma.loraJob.create({
      data: { workspaceId, assetPrefix, status: 'PENDING' },
    })

    try {
      const producer = getKafkaProducer()
      await producer.send(TOPIC_LORA, {
        eventId: crypto.randomUUID(),
        workspaceId,
        timestamp: new Date().toISOString(),
        jobId: job.id,
        assetPrefix,
      })
    } catch (err) {
      app.log.error(err, 'Failed to emit lora.train_requested event')
      await prisma.loraJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: 'Failed to queue training job' },
      })
    }

    return reply.status(201).send(serializeLoraJob(job))
  })

  app.get('/lora-jobs', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(LoraJobResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const jobs = await prisma.loraJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    return jobs.map(serializeLoraJob)
  })
}
