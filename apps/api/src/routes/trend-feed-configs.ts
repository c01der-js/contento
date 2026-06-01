import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { Prisma, prisma } from '@contento/db'
import { requireMinRole } from '../middleware/rbac.js'

const ErrorResponse = z.object({ error: z.string() })

const KNOWN_SOURCES = ['rss', 'reddit', 'google_trends', 'youtube'] as const
const SourceEnum = z.enum(KNOWN_SOURCES)

const ConfigResponse = z.object({
  id: z.string(),
  source: z.string(),
  config: z.unknown(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const WorkspaceParams = z.object({ workspaceId: z.string() })

/**
 * Trend feed configs are global (one set across all workspaces). We expose them
 * under the workspace prefix so the existing RBAC middleware applies — only
 * OWNER role in any workspace can manage them.
 */
export const trendFeedConfigRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/trend-feed-configs', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(ConfigResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireMinRole('VIEWER')],
  }, async () => {
    const rows = await prisma.trendFeedConfig.findMany({ orderBy: { createdAt: 'asc' } })
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      config: r.config,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  })

  app.post('/trend-feed-configs', {
    schema: {
      params: WorkspaceParams,
      body: z.object({
        source: SourceEnum,
        config: z.record(z.unknown()).default({}),
        enabled: z.boolean().default(true),
      }),
      response: {
        201: ConfigResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireMinRole('OWNER')],
  }, async (request, reply) => {
    const { source, config, enabled } = request.body
    const created = await prisma.trendFeedConfig.create({
      data: { source, config: config as Prisma.InputJsonValue, enabled },
    })
    return reply.status(201).send({
      id: created.id,
      source: created.source,
      config: created.config,
      enabled: created.enabled,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    })
  })

  app.patch('/trend-feed-configs/:id', {
    schema: {
      params: WorkspaceParams.extend({ id: z.string() }),
      body: z.object({
        config: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
      }),
      response: {
        200: ConfigResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireMinRole('OWNER')],
  }, async (request, reply) => {
    const { id } = request.params
    const existing = await prisma.trendFeedConfig.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    const updated = await prisma.trendFeedConfig.update({
      where: { id },
      data: {
        ...(request.body.config !== undefined
          ? { config: request.body.config as Prisma.InputJsonValue }
          : {}),
        ...(request.body.enabled !== undefined ? { enabled: request.body.enabled } : {}),
      },
    })
    return reply.status(200).send({
      id: updated.id,
      source: updated.source,
      config: updated.config,
      enabled: updated.enabled,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  })

  app.delete('/trend-feed-configs/:id', {
    schema: {
      params: WorkspaceParams.extend({ id: z.string() }),
      response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireMinRole('OWNER')],
  }, async (request, reply) => {
    const { id } = request.params
    const existing = await prisma.trendFeedConfig.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.trendFeedConfig.delete({ where: { id } })
    return reply.status(204).send(null)
  })
}
