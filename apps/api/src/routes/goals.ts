import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ItemParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const GoalTypeSchema = z.enum(['SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH'])

const GoalResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: GoalTypeSchema,
  targetValue: z.number().nullable(),
  currentValue: z.number().nullable(),
  deadline: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const GoalCreateBody = z.object({
  type: GoalTypeSchema,
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  deadline: z.string().datetime().optional(),
})

const GoalPatchBody = z.object({
  type: GoalTypeSchema.optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
})

export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/goals
  app.get('/goals', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(GoalResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const goals = await prisma.goal.findMany({
      where: { workspaceId: request.params.workspaceId },
      orderBy: { createdAt: 'asc' },
    })
    return goals.map((g) => ({
      id: g.id,
      workspaceId: g.workspaceId,
      type: g.type as 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH',
      targetValue: g.targetValue ?? null,
      currentValue: g.currentValue ?? null,
      deadline: g.deadline ? g.deadline.toISOString() : null,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }))
  })

  // POST /workspaces/:workspaceId/goals
  app.post('/goals', {
    schema: {
      params: WorkspaceParams,
      body: GoalCreateBody,
      response: {
        201: GoalResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const goal = await prisma.goal.create({
      data: {
        workspaceId: request.params.workspaceId,
        type: request.body.type,
        ...(request.body.targetValue != null ? { targetValue: request.body.targetValue } : {}),
        ...(request.body.currentValue != null ? { currentValue: request.body.currentValue } : {}),
        ...(request.body.deadline ? { deadline: new Date(request.body.deadline) } : {}),
      },
    })
    return reply.status(201).send({
      id: goal.id,
      workspaceId: goal.workspaceId,
      type: goal.type as 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH',
      targetValue: goal.targetValue ?? null,
      currentValue: goal.currentValue ?? null,
      deadline: goal.deadline ? goal.deadline.toISOString() : null,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    })
  })

  // PATCH /workspaces/:workspaceId/goals/:id
  app.patch('/goals/:id', {
    schema: {
      params: ItemParams,
      body: GoalPatchBody,
      response: {
        200: GoalResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const existing = await prisma.goal.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const updateData: Record<string, unknown> = {}
    if (request.body.type !== undefined) updateData.type = request.body.type
    if (request.body.targetValue !== undefined) updateData.targetValue = request.body.targetValue
    if (request.body.currentValue !== undefined) updateData.currentValue = request.body.currentValue
    if (request.body.deadline !== undefined) {
      updateData.deadline = request.body.deadline ? new Date(request.body.deadline) : null
    }

    const goal = await prisma.goal.update({
      where: { id: request.params.id },
      data: updateData,
    })
    return {
      id: goal.id,
      workspaceId: goal.workspaceId,
      type: goal.type as 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH',
      targetValue: goal.targetValue ?? null,
      currentValue: goal.currentValue ?? null,
      deadline: goal.deadline ? goal.deadline.toISOString() : null,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    }
  })

  // DELETE /workspaces/:workspaceId/goals/:id
  app.delete('/goals/:id', {
    schema: {
      params: ItemParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const existing = await prisma.goal.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.goal.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })
}
