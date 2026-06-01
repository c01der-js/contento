import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import type { AvatarPersonaStatus } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { generateCharacterPortrait, pollJobUntilDone, isMockMode, MOCK_IMAGE_URL } from '@contento/ai'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const AvatarPersonaResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  description: z.string(),
  style: z.string(),
  gender: z.string(),
  referenceImageUrl: z.string().nullable(),
  higgsfieldSoulId: z.string().nullable(),
  status: z.enum(['PENDING', 'GENERATING', 'READY', 'FAILED']),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const UpsertBody = z.object({
  description: z.string().min(1),
  style: z.enum(['professional', 'casual', 'energetic', 'authoritative', 'friendly']),
  gender: z.enum(['male', 'female', 'neutral']),
  higgsfieldSoulId: z.string().optional(),
})

function serialize(p: {
  id: string; workspaceId: string; description: string; style: string; gender: string
  referenceImageUrl: string | null; higgsfieldSoulId: string | null
  status: AvatarPersonaStatus; errorMessage: string | null; createdAt: Date; updatedAt: Date
}) {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export const avatarPersonaRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /avatar-persona
  app.get('/avatar-persona', {
    schema: {
      params: WorkspaceParams,
      response: { 200: AvatarPersonaResponse.nullable(), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const persona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
    return reply.send(persona ? serialize(persona) : null)
  })

  // POST /avatar-persona — upsert description/style/gender
  app.post('/avatar-persona', {
    schema: {
      params: WorkspaceParams,
      body: UpsertBody,
      response: { 200: AvatarPersonaResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { description, style, gender, higgsfieldSoulId } = request.body

    const persona = await prisma.avatarPersona.upsert({
      where: { workspaceId },
      update: { description, style, gender, ...(higgsfieldSoulId ? { higgsfieldSoulId } : {}), status: 'PENDING' },
      create: { workspaceId, description, style, gender, higgsfieldSoulId: higgsfieldSoulId ?? null, status: 'PENDING' },
    })

    return reply.send(serialize(persona))
  })

  // POST /avatar-persona/generate-image — trigger Higgsfield portrait generation
  app.post('/avatar-persona/generate-image', {
    schema: {
      params: WorkspaceParams,
      response: { 202: AvatarPersonaResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const persona = await prisma.avatarPersona.findUnique({ where: { workspaceId } })
    if (!persona) return reply.status(404).send({ error: 'Avatar persona not set. Call POST /avatar-persona first.' })

    const updated = await prisma.avatarPersona.update({
      where: { workspaceId },
      data: { status: 'GENERATING', errorMessage: null },
    })

    // Fire-and-forget background generation
    ;(async () => {
      try {
        let imageUrl: string
        if (isMockMode()) {
          imageUrl = MOCK_IMAGE_URL
        } else {
          const jobSetId = await generateCharacterPortrait(persona.description, persona.style, persona.gender)
          imageUrl = await pollJobUntilDone(jobSetId)
        }
        await prisma.avatarPersona.update({
          where: { workspaceId },
          data: { referenceImageUrl: imageUrl, status: 'READY' },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await prisma.avatarPersona.update({
          where: { workspaceId },
          data: { status: 'FAILED', errorMessage: msg },
        })
      }
    })()

    return reply.status(202).send(serialize(updated))
  })
}
