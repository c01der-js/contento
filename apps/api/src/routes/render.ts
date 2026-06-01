import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { TEMPLATE_CONFIG } from '@contento/brand-kit'
import { requireRole } from '../middleware/rbac.js'
import { getRenderQueue } from '../queue.js'

const TEMPLATE_IDS = TEMPLATE_CONFIG.map(t => t.id) as [string, ...string[]]

const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })
const RenderBody = z.object({
  templateId: z.enum(TEMPLATE_IDS).optional(),
})
const ErrorResponse = z.object({ error: z.string() })

const RenderJobResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scriptId: z.string(),
  status: z.string(),
  templateId: z.string(),
  outputUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  bullJobId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function serializeRenderJob(job: {
  id: string
  workspaceId: string
  scriptId: string
  status: string
  templateId: string
  outputUrl: string | null
  errorMessage: string | null
  bullJobId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }
}

export const renderRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /scripts/:scriptId/render
  app.post('/scripts/:scriptId/render', {
    schema: {
      params: ScriptParams,
      body: RenderBody,
      response: {
        201: RenderJobResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    const renderableStatuses = ['BRAND_CHECKED', 'APPROVED', 'IN_REVIEW']
    if (!renderableStatuses.includes(script.status)) {
      return reply.status(400).send({ error: 'Script must be brand-checked before rendering' })
    }

    const templateId = request.body.templateId ?? 'SingleImagePost'

    const job = await prisma.renderJob.create({
      data: { workspaceId, scriptId, status: 'PENDING', templateId },
    })

    let bullJobId: string | null = null
    try {
      const queue = getRenderQueue()
      const bullJob = await queue.add('render-job', { renderJobId: job.id, scriptId, workspaceId })
      bullJobId = bullJob.id ?? null
    } catch (e) {
      await prisma.renderJob.delete({ where: { id: job.id } }).catch(() => {})
      throw e
    }

    const updatedJob = await prisma.renderJob.update({
      where: { id: job.id },
      data: { bullJobId },
    })

    return reply.status(201).send(serializeRenderJob(updatedJob))
  })

  // GET /scripts/:scriptId/render-job
  app.get('/scripts/:scriptId/render-job', {
    schema: {
      params: ScriptParams,
      response: {
        200: RenderJobResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const job = await prisma.renderJob.findFirst({
      where: { scriptId, workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    if (!job) return reply.status(404).send({ error: 'Not found' })

    return reply.status(200).send(serializeRenderJob(job))
  })
}
