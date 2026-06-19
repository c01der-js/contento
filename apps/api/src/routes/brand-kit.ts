import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'
import { ContentFormatSchema } from '@contento/shared'
import { buildBrandContext, writeScript, embedText, writeGoldenEmbedding } from '@contento/ai'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ItemParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// --- BrandTone schemas ---
const BrandToneResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  examples: z.array(z.string()),
  adjectives: z.array(z.string()),
  examplesPositive: z.array(z.string()),
  examplesNegative: z.array(z.string()),
  values: z.array(z.string()),
  manifesto: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const BrandToneBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  examples: z.array(z.string()).optional().default([]),
  adjectives: z.array(z.string()).optional().default([]),
  examplesPositive: z.array(z.string()).optional().default([]),
  examplesNegative: z.array(z.string()).optional().default([]),
  values: z.array(z.string()).optional().default([]),
  manifesto: z.string().optional(),
})

// --- BrandPillar schemas ---
const BrandPillarResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  keywords: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const BrandPillarBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
})

// --- BrandVocabulary schemas ---
const BrandVocabularyResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  word: z.string(),
  type: z.enum(['ALLOW', 'FORBID']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const BrandVocabularyBody = z.object({
  word: z.string().min(1),
  type: z.enum(['ALLOW', 'FORBID']),
})

// --- Persona schemas ---
const PersonaResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  painPoints: z.array(z.string()),
  desires: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const PersonaBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  painPoints: z.array(z.string()).optional().default([]),
  desires: z.array(z.string()).optional().default([]),
})

// --- VisualIdentity schemas ---
const VisualIdentityResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  accentColor: z.string().nullable(),
  fontPrimary: z.string().nullable(),
  fontSecondary: z.string().nullable(),
  logoUrl: z.string().nullable(),
  watermarkUrl: z.string().nullable(),
  logoFullUrl: z.string().nullable(),
  logoIconUrl: z.string().nullable(),
  logoLightUrl: z.string().nullable(),
  logoDarkUrl: z.string().nullable(),
  graphicElements: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const VisualIdentityBody = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontPrimary: z.string().optional(),
  fontSecondary: z.string().optional(),
  logoUrl: z.string().optional(),
  watermarkUrl: z.string().optional(),
  logoFullUrl: z.string().optional(),
  logoIconUrl: z.string().optional(),
  logoLightUrl: z.string().optional(),
  logoDarkUrl: z.string().optional(),
  graphicElements: z.unknown().optional(),
})

// --- Competitor schemas ---
const CompetitorResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CompetitorBody = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  notes: z.string().optional(),
})

// --- GoldenExample schemas ---
const GoldenExampleResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  content: z.string(),
  format: z.string(),
  platform: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const GoldenExampleBody = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  format: ContentFormatSchema,
  platform: z.string().min(1),
})

// --- AntiExample schemas ---
const AntiExampleResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  content: z.string(),
  format: z.string().nullable(),
  platform: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const AntiExampleBody = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  format: z.string().optional(),
  platform: z.string().optional(),
  reason: z.string().optional(),
})

// --- TabooTopic schemas ---
const TabooTopicResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  topic: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const TabooTopicBody = z.object({
  topic: z.string().min(1),
  reason: z.string().optional(),
})

// --- Brand Preview schemas ---
const BrandPreviewItem = z.object({
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  caption: z.string(),
})

export const brandKitRoutes: FastifyPluginAsyncZod = async (app) => {
  // =====================
  // BrandTone routes
  // =====================

  app.get('/brand/tones', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(BrandToneResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const tones = await prisma.brandTone.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return tones.map((t) => ({
      ...t,
      manifesto: t.manifesto ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/tones', {
    schema: {
      params: WorkspaceParams,
      body: BrandToneBody,
      response: {
        201: BrandToneResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const tone = await prisma.brandTone.create({
      data: {
        workspaceId: request.params.workspaceId,
        name: request.body.name,
        description: request.body.description ?? null,
        examples: request.body.examples,
        adjectives: request.body.adjectives,
        examplesPositive: request.body.examplesPositive,
        examplesNegative: request.body.examplesNegative,
        values: request.body.values,
        manifesto: request.body.manifesto ?? null,
      },
    })
    return reply.status(201).send({
      ...tone,
      manifesto: tone.manifesto ?? null,
      createdAt: tone.createdAt.toISOString(),
      updatedAt: tone.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/tones/:id', {
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
    const existing = await prisma.brandTone.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.brandTone.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // =====================
  // BrandPillar routes
  // =====================

  app.get('/brand/pillars', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(BrandPillarResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const pillars = await prisma.brandPillar.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return pillars.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/pillars', {
    schema: {
      params: WorkspaceParams,
      body: BrandPillarBody,
      response: {
        201: BrandPillarResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const pillar = await prisma.brandPillar.create({
      data: {
        workspaceId: request.params.workspaceId,
        name: request.body.name,
        description: request.body.description ?? null,
        keywords: request.body.keywords,
      },
    })
    return reply.status(201).send({
      ...pillar,
      createdAt: pillar.createdAt.toISOString(),
      updatedAt: pillar.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/pillars/:id', {
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
    const existing = await prisma.brandPillar.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.brandPillar.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ========================
  // BrandVocabulary routes
  // ========================

  app.get('/brand/vocabulary', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(BrandVocabularyResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const words = await prisma.brandVocabulary.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return words.map((w) => ({
      ...w,
      type: w.type as 'ALLOW' | 'FORBID',
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/vocabulary', {
    schema: {
      params: WorkspaceParams,
      body: BrandVocabularyBody,
      response: {
        201: BrandVocabularyResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        409: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    try {
      const word = await prisma.brandVocabulary.create({
        data: {
          workspaceId: request.params.workspaceId,
          word: request.body.word,
          type: request.body.type,
        },
      })
      return reply.status(201).send({
        ...word,
        type: word.type as 'ALLOW' | 'FORBID',
        createdAt: word.createdAt.toISOString(),
        updatedAt: word.updatedAt.toISOString(),
      })
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'Word already exists in this workspace' })
      }
      throw e
    }
  })

  app.delete('/brand/vocabulary/:id', {
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
    const existing = await prisma.brandVocabulary.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.brandVocabulary.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // =====================
  // Persona routes
  // =====================

  app.get('/brand/personas', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(PersonaResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const personas = await prisma.persona.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return personas.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/personas', {
    schema: {
      params: WorkspaceParams,
      body: PersonaBody,
      response: {
        201: PersonaResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const persona = await prisma.persona.create({
      data: {
        workspaceId: request.params.workspaceId,
        name: request.body.name,
        description: request.body.description ?? null,
        painPoints: request.body.painPoints,
        desires: request.body.desires,
      },
    })
    return reply.status(201).send({
      ...persona,
      createdAt: persona.createdAt.toISOString(),
      updatedAt: persona.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/personas/:id', {
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
    const existing = await prisma.persona.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.persona.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ==========================
  // VisualIdentity routes (1:1)
  // ==========================

  app.get('/brand/visual-identity', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: VisualIdentityResponse.nullable(),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const vi = await prisma.visualIdentity.findUnique({
      where: { workspaceId: request.params.workspaceId },
    })
    if (!vi) return reply.status(200).send(null)
    return {
      ...vi,
      graphicElements: vi.graphicElements ?? null,
      createdAt: vi.createdAt.toISOString(),
      updatedAt: vi.updatedAt.toISOString(),
    }
  })

  app.put('/brand/visual-identity', {
    schema: {
      params: WorkspaceParams,
      body: VisualIdentityBody,
      response: {
        200: VisualIdentityResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const viData = {
      primaryColor: request.body.primaryColor ?? null,
      secondaryColor: request.body.secondaryColor ?? null,
      accentColor: request.body.accentColor ?? null,
      fontPrimary: request.body.fontPrimary ?? null,
      fontSecondary: request.body.fontSecondary ?? null,
      logoUrl: request.body.logoUrl ?? null,
      watermarkUrl: request.body.watermarkUrl ?? null,
      logoFullUrl: request.body.logoFullUrl ?? null,
      logoIconUrl: request.body.logoIconUrl ?? null,
      logoLightUrl: request.body.logoLightUrl ?? null,
      logoDarkUrl: request.body.logoDarkUrl ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graphicElements: (request.body.graphicElements !== undefined ? request.body.graphicElements : null) as any,
    }
    const vi = await prisma.visualIdentity.upsert({
      where: { workspaceId: request.params.workspaceId },
      create: { workspaceId: request.params.workspaceId, ...viData },
      update: viData,
    })
    return {
      ...vi,
      graphicElements: vi.graphicElements ?? null,
      createdAt: vi.createdAt.toISOString(),
      updatedAt: vi.updatedAt.toISOString(),
    }
  })

  // =====================
  // Competitor routes
  // =====================

  app.get('/brand/competitors', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(CompetitorResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const competitors = await prisma.competitor.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return competitors.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/competitors', {
    schema: {
      params: WorkspaceParams,
      body: CompetitorBody,
      response: {
        201: CompetitorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const competitor = await prisma.competitor.create({
      data: {
        workspaceId: request.params.workspaceId,
        name: request.body.name,
        url: request.body.url ?? null,
        notes: request.body.notes ?? null,
      },
    })
    return reply.status(201).send({
      ...competitor,
      createdAt: competitor.createdAt.toISOString(),
      updatedAt: competitor.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/competitors/:id', {
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
    const existing = await prisma.competitor.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.competitor.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ========================
  // GoldenExample routes
  // ========================

  app.get('/brand/golden-examples', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(GoldenExampleResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const examples = await prisma.goldenExample.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return examples.map((e) => ({
      id: e.id,
      workspaceId: e.workspaceId,
      title: e.title,
      content: e.content,
      format: e.format,
      platform: e.platform,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/golden-examples', {
    schema: {
      params: WorkspaceParams,
      body: GoldenExampleBody,
      response: {
        201: GoldenExampleResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const example = await prisma.goldenExample.create({
      data: {
        workspaceId: request.params.workspaceId,
        title: request.body.title,
        content: request.body.content,
        format: request.body.format,
        platform: request.body.platform,
      },
    })
    // Feedback loop: embed so this example is retrievable by similarity. Best-effort.
    try {
      await writeGoldenEmbedding(example.id, await embedText(example.content))
    } catch (err) {
      console.error('[feedback] failed to embed golden example', example.id, err)
    }

    return reply.status(201).send({
      id: example.id,
      workspaceId: example.workspaceId,
      title: example.title,
      content: example.content,
      format: example.format,
      platform: example.platform,
      createdAt: example.createdAt.toISOString(),
      updatedAt: example.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/golden-examples/:id', {
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
    const existing = await prisma.goldenExample.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.goldenExample.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ========================
  // AntiExample routes
  // ========================

  app.get('/brand/anti-examples', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(AntiExampleResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const examples = await prisma.antiExample.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return examples.map((e) => ({
      ...e,
      format: e.format ?? null,
      platform: e.platform ?? null,
      reason: e.reason ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/anti-examples', {
    schema: {
      params: WorkspaceParams,
      body: AntiExampleBody,
      response: {
        201: AntiExampleResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const example = await prisma.antiExample.create({
      data: {
        workspaceId: request.params.workspaceId,
        title: request.body.title,
        content: request.body.content,
        format: request.body.format ?? null,
        platform: request.body.platform ?? null,
        reason: request.body.reason ?? null,
      },
    })
    return reply.status(201).send({
      ...example,
      format: example.format ?? null,
      platform: example.platform ?? null,
      reason: example.reason ?? null,
      createdAt: example.createdAt.toISOString(),
      updatedAt: example.updatedAt.toISOString(),
    })
  })

  app.delete('/brand/anti-examples/:id', {
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
    const existing = await prisma.antiExample.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.antiExample.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ========================
  // TabooTopic routes
  // ========================

  app.get('/brand/taboo-topics', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(TabooTopicResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const topics = await prisma.tabooTopic.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return topics.map((t) => ({
      ...t,
      reason: t.reason ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }))
  })

  app.post('/brand/taboo-topics', {
    schema: {
      params: WorkspaceParams,
      body: TabooTopicBody,
      response: {
        201: TabooTopicResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        409: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    try {
      const topic = await prisma.tabooTopic.create({
        data: {
          workspaceId: request.params.workspaceId,
          topic: request.body.topic,
          reason: request.body.reason ?? null,
        },
      })
      return reply.status(201).send({
        ...topic,
        reason: topic.reason ?? null,
        createdAt: topic.createdAt.toISOString(),
        updatedAt: topic.updatedAt.toISOString(),
      })
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'Topic already exists in this workspace' })
      }
      throw e
    }
  })

  app.delete('/brand/taboo-topics/:id', {
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
    const existing = await prisma.tabooTopic.findFirst({
      where: { id: request.params.id, workspaceId: request.params.workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.tabooTopic.delete({ where: { id: request.params.id } })
    return reply.status(204).send(null)
  })

  // ========================
  // Brand Preview endpoint
  // ========================

  app.post('/brand-preview', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(BrandPreviewItem),
        401: ErrorResponse,
        403: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const workspaceId = request.params.workspaceId
    // Verify brand context is loadable (also fetches data for the preview prompt)
    await buildBrandContext(workspaceId)

    const previewIdea = {
      title: 'Brand Voice Preview',
      angle: 'Showcase the brand personality',
      format: 'text-post',
      platform: 'Instagram',
    }

    try {
      const scripts = await Promise.all([
        writeScript(workspaceId, previewIdea),
        writeScript(workspaceId, { ...previewIdea, angle: 'Highlight core values' }),
        writeScript(workspaceId, { ...previewIdea, angle: 'Connect with the target audience' }),
      ])

      return scripts.map((s) => ({
        hook: s.hook,
        body: s.body,
        cta: s.cta,
        caption: s.caption,
      }))
    } catch {
      return reply.status(500).send({ error: 'Failed to generate brand preview' })
    }
  })
}
