import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole } from '../middleware/rbac.js'
import { analyzeCompany, generateBrandKit } from '@contento/ai'

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

  // Auto-fill the editable Brand Kit (voice/tone, pillars, vocabulary, personas, visual identity)
  // from the company portrait. Idempotent: a no-op if the brand kit already has tones.
  app.post('/brand-kit/generate', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.object({
          skipped: z.boolean(),
          created: z.object({
            tones: z.number(),
            pillars: z.number(),
            vocabulary: z.number(),
            personas: z.number(),
            visualIdentity: z.boolean(),
          }),
        }),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const portrait = await prisma.companyPortrait.findUnique({ where: { workspaceId } })
    if (!portrait) {
      return reply.status(400).send({ error: 'Company portrait not found. Run onboarding first.' })
    }

    // Idempotency: never duplicate an existing brand kit.
    const existingTones = await prisma.brandTone.count({ where: { workspaceId } })
    if (existingTones > 0) {
      return reply.send({ skipped: true, created: { tones: 0, pillars: 0, vocabulary: 0, personas: 0, visualIdentity: false } })
    }

    const rawInput = (portrait.rawInput ?? {}) as { companyName?: string }
    const kit = await generateBrandKit(workspaceId, {
      companyName: rawInput.companyName ?? '',
      niche: portrait.niche,
      description: portrait.description,
      usp: portrait.usp,
      targetAudience: portrait.targetAudience,
      contentAngles: portrait.contentAngles,
    })

    const vi = kit.visualIdentity
    const viData = vi
      ? {
          primaryColor: vi.primaryColor ?? null,
          secondaryColor: vi.secondaryColor ?? null,
          accentColor: vi.accentColor ?? null,
          fontPrimary: vi.fontPrimary ?? null,
          fontSecondary: vi.fontSecondary ?? null,
        }
      : null

    await prisma.$transaction([
      ...(kit.tones.length
        ? [prisma.brandTone.createMany({
            data: kit.tones.map((t) => ({
              workspaceId,
              name: t.name,
              description: t.description ?? null,
              adjectives: t.adjectives ?? [],
              values: t.values ?? [],
              examplesPositive: t.examplesPositive ?? [],
              examplesNegative: t.examplesNegative ?? [],
              examples: [],
              manifesto: t.manifesto ?? null,
            })),
          })]
        : []),
      ...(kit.pillars.length
        ? [prisma.brandPillar.createMany({
            data: kit.pillars.map((p) => ({ workspaceId, name: p.name, description: p.description ?? null, keywords: p.keywords ?? [] })),
          })]
        : []),
      ...(kit.vocabulary.length
        ? [prisma.brandVocabulary.createMany({
            data: kit.vocabulary.map((v) => ({ workspaceId, word: v.word, type: (v.type === 'FORBID' ? 'FORBID' : 'ALLOW') as 'ALLOW' | 'FORBID' })),
            skipDuplicates: true,
          })]
        : []),
      ...(kit.personas.length
        ? [prisma.persona.createMany({
            data: kit.personas.map((p) => ({ workspaceId, name: p.name, description: p.description ?? null, painPoints: p.painPoints ?? [], desires: p.desires ?? [] })),
          })]
        : []),
      ...(viData
        ? [prisma.visualIdentity.upsert({ where: { workspaceId }, create: { workspaceId, ...viData }, update: viData })]
        : []),
    ])

    return reply.send({
      skipped: false,
      created: {
        tones: kit.tones.length,
        pillars: kit.pillars.length,
        vocabulary: kit.vocabulary.length,
        personas: kit.personas.length,
        visualIdentity: !!vi,
      },
    })
  })
}
