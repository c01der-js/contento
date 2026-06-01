import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ScriptResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ideaId: z.string().nullable(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  status: z.string(),
  brandCheckScore: z.number().nullable(),
  brandCheckNotes: z.string().nullable(),
  brandCheckCriteria: z.unknown().nullable(),
  submittedById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function serializeScript(s: {
  id: string
  workspaceId: string
  ideaId: string | null
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
  brandCheckScore: number | null
  brandCheckNotes: string | null
  brandCheckCriteria: unknown
  submittedById: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    ideaId: s.ideaId ?? null,
    hook: s.hook,
    body: s.body,
    cta: s.cta,
    caption: s.caption,
    hashtags: s.hashtags,
    status: s.status,
    brandCheckScore: s.brandCheckScore,
    brandCheckNotes: s.brandCheckNotes,
    brandCheckCriteria: s.brandCheckCriteria ?? null,
    submittedById: s.submittedById,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /scripts/:scriptId/submit-review
  app.post('/scripts/:scriptId/submit-review', {
    schema: {
      params: ScriptParams,
      response: {
        200: ScriptResponse,
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

    if (script.status !== 'DRAFT' && script.status !== 'BRAND_CHECKED') {
      return reply.status(400).send({ error: 'Script must be in DRAFT or BRAND_CHECKED status to submit for review' })
    }

    const updated = await prisma.script.update({
      where: { id: scriptId },
      data: {
        status: 'IN_REVIEW',
        submittedById: request.authUser!.userId,
      },
    })

    return reply.status(200).send(serializeScript(updated))
  })

  // POST /scripts/:scriptId/approve
  app.post('/scripts/:scriptId/approve', {
    schema: {
      params: ScriptParams,
      response: {
        200: ScriptResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    if (script.status !== 'IN_REVIEW') {
      return reply.status(400).send({ error: 'Script must be in IN_REVIEW status to approve' })
    }

    const [updated] = await prisma.$transaction([
      prisma.script.update({
        where: { id: scriptId },
        data: { status: 'APPROVED' },
      }),
      prisma.approval.create({
        data: {
          scriptId,
          reviewerId: request.authUser!.userId,
          status: 'APPROVED',
        },
      }),
    ])

    return reply.status(200).send(serializeScript(updated))
  })

  // POST /scripts/:scriptId/reject
  app.post('/scripts/:scriptId/reject', {
    schema: {
      params: ScriptParams,
      body: z.object({ comment: z.string().min(1) }),
      response: {
        200: ScriptResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { comment } = request.body

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    if (script.status !== 'IN_REVIEW') {
      return reply.status(400).send({ error: 'Script must be in IN_REVIEW status to reject' })
    }

    const [updated] = await prisma.$transaction([
      prisma.script.update({
        where: { id: scriptId },
        data: { status: 'REJECTED' },
      }),
      prisma.approval.create({
        data: {
          scriptId,
          reviewerId: request.authUser!.userId,
          status: 'REJECTED',
          comment,
        },
      }),
    ])

    return reply.status(200).send(serializeScript(updated))
  })

  // GET /review-queue
  app.get('/review-queue', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(ScriptResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('APPROVER', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params

    const scripts = await prisma.script.findMany({
      where: { workspaceId, status: 'IN_REVIEW' },
      orderBy: { updatedAt: 'asc' },
    })

    return scripts.map(serializeScript)
  })
}
