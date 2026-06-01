import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const MentionResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  source: z.string(),
  url: z.string(),
  text: z.string(),
  sentiment: z.string(),
  urgency: z.number(),
  summary: z.string().nullable(),
  seenAt: z.string(),
  createdAt: z.string(),
})

export const mentionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/mentions', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({
        urgencyMin: z.coerce.number().int().min(0).max(10).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
      response: {
        200: z.array(MentionResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { urgencyMin, limit } = request.query

    const mentions = await prisma.mention.findMany({
      where: {
        workspaceId,
        ...(urgencyMin !== undefined ? { urgency: { gte: urgencyMin } } : {}),
      },
      orderBy: { seenAt: 'desc' },
      take: limit ?? 50,
    })

    return mentions.map(m => ({
      id: m.id,
      workspaceId: m.workspaceId,
      source: m.source,
      url: m.url,
      text: m.text,
      sentiment: m.sentiment,
      urgency: m.urgency,
      summary: m.summary,
      seenAt: m.seenAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
    }))
  })
}
