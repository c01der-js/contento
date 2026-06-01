import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const Params = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ActivityQuerystring = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const ActorResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
}).nullable()

const ActivityLogResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  actorId: z.string().nullable(),
  actor: ActorResponse,
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  entityType: z.string(),
  entityId: z.string(),
  meta: z.unknown(),
  createdAt: z.string(),
})

export const activityRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/activity
  app.get('/activity', {
    schema: {
      params: Params,
      querystring: ActivityQuerystring,
      response: {
        200: z.object({
          items: z.array(ActivityLogResponse),
          nextCursor: z.string().nullable(),
        }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'AUTHOR', 'DESIGNER', 'VIEWER', 'CLIENT')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { cursor, limit } = request.query

    const logs = await prisma.activityLog.findMany({
      where: {
        workspaceId,
        ...(cursor !== undefined && {
          createdAt: { lt: new Date(cursor) },
        }),
      },
      include: {
        actor: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    })

    const hasMore = logs.length > limit
    const items = hasMore ? logs.slice(0, limit) : logs
    const lastItem = items[items.length - 1]
    const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null

    return {
      items: items.map((log) => ({
        id: log.id,
        workspaceId: log.workspaceId,
        actorId: log.actorId ?? null,
        actor: log.actor
          ? {
              id: log.actor.id,
              name: log.actor.name ?? null,
              email: log.actor.email,
              avatarUrl: log.actor.avatarUrl ?? null,
            }
          : null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        meta: log.meta,
        createdAt: log.createdAt.toISOString(),
      })),
      nextCursor,
    }
  })
}
