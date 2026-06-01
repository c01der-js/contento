import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { analyzeCompany } from '@contento/ai'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const CompanyPortraitResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  niche: z.string(),
  description: z.string(),
  usp: z.string(),
  targetAudience: z.string(),
  competitors: z.array(z.string()),
  contentAngles: z.array(z.string()),
  generatedAt: z.string(),
  updatedAt: z.string(),
})

const GenerateBody = z.object({
  companyName: z.string().min(1),
  niche: z.string().min(1),
  website: z.string().url().optional(),
  description: z.string().min(1),
  usp: z.string().min(1),
  targetAudience: z.string().min(1),
  competitors: z.array(z.string()).optional().default([]),
})

function serialize(p: {
  id: string; workspaceId: string; niche: string; description: string
  usp: string; targetAudience: string; competitors: string[]; contentAngles: string[]
  generatedAt: Date; updatedAt: Date
}) {
  return { ...p, generatedAt: p.generatedAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export const companyPortraitRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/company-portrait', {
    schema: {
      params: WorkspaceParams,
      response: { 200: CompanyPortraitResponse.nullable(), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const portrait = await prisma.companyPortrait.findUnique({ where: { workspaceId } })
    return reply.send(portrait ? serialize(portrait) : null)
  })

  app.post('/company-portrait/generate', {
    schema: {
      params: WorkspaceParams,
      body: GenerateBody,
      response: { 200: CompanyPortraitResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const input = request.body

    const companyInput = {
      companyName: input.companyName,
      niche: input.niche,
      description: input.description,
      usp: input.usp,
      targetAudience: input.targetAudience,
      competitors: input.competitors,
      ...(input.website !== undefined ? { website: input.website } : {}),
    }
    const result = await analyzeCompany(workspaceId, companyInput)

    const portrait = await prisma.companyPortrait.upsert({
      where: { workspaceId },
      update: { ...result, rawInput: input as object, generatedAt: new Date() },
      create: { workspaceId, ...result, rawInput: input as object },
    })

    return reply.send(serialize(portrait))
  })
}
