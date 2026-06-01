import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import type { Prisma } from '@contento/db'
import { analyzeTrend, generateIdeas, writeScript, checkBrand, convertFormat } from '@contento/ai'
import { buildBrandContext } from '@contento/ai'
import { TrendSourceSchema } from '@contento/shared'
import { requireRole } from '../middleware/rbac.js'
import { getTrendFetchQueue } from '../queue.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// --- Trend schemas ---
const TrendResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  source: z.string(),
  status: z.string(),
  relevanceScore: z.number().nullable(),
  category: z.string().nullable(),
  lifecycle: z.enum(['RISING', 'PEAK', 'DECLINING', 'FLAT']).nullable(),
  sourceMetadata: z.unknown().nullable(),
  discoveredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const TrendQuerystring = z.object({
  status: z.enum(['PENDING', 'ANALYZED', 'ARCHIVED']).optional(),
  source: TrendSourceSchema.optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
})

const TrendBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  url: z.string().optional(),
  source: TrendSourceSchema.optional(),
})

const TrendParams = z.object({ workspaceId: z.string(), trendId: z.string() })

// --- Feedback schemas ---
const FeedbackBody = z.object({
  signal: z.enum(['INTERESTING', 'NOT_RELEVANT']),
})

const FeedbackResponse = z.object({
  id: z.string(),
  trendId: z.string(),
  userId: z.string(),
  signal: z.string(),
  createdAt: z.string(),
})

// --- Idea schemas ---
const IdeaResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  trendId: z.string(),
  title: z.string(),
  angle: z.string(),
  format: z.string(),
  platform: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const IdeaParams = z.object({ workspaceId: z.string(), ideaId: z.string() })
const IdeasQuerystring = z.object({ trendId: z.string().optional() })

// --- Script schemas ---
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
  submittedById: z.string().nullable(),
  brandCheckScore: z.number().nullable(),
  brandCheckNotes: z.string().nullable(),
  brandCheckCriteria: z.unknown().nullable(),
  autoFixes: z.unknown().nullable(),
  parentId: z.string().nullable(),
  version: z.number(),
  lengthVariant: z.enum(['SHORT', 'LONG']).nullable(),
  hasTts: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })

const PatchScriptBody = z.object({
  hook: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  cta: z.string().min(1).optional(),
  captions: z.record(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
})

const RegenerateScriptBody = z.object({
  feedback: z.string().optional(),
})

const ScriptVersionResponse = z.object({
  id: z.string(),
  scriptId: z.string(),
  version: z.number(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  captions: z.unknown().nullable(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
})

const DiffQuerystring = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
})

const ConvertScriptBody = z.object({
  targetFormat: z.string().min(1),
})

const CreateVariantBody = z.object({
  lengthVariant: z.enum(['SHORT', 'LONG']).optional(),
  hasTts: z.boolean().optional(),
})

// --- Brand check response schema ---
const BrandCheckResponse = z.object({
  overallScore: z.number(),
  passed: z.boolean(),
  summary: z.string(),
  criteria: z.object({
    tone: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
    vocabulary: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
    pillar: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
    persona: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
    visual: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
    legal: z.object({ score: z.number(), passed: z.boolean(), issues: z.array(z.string()), suggestions: z.array(z.string()) }),
  }),
  autoFixes: z.object({
    hook: z.string().optional(),
    body: z.string().optional(),
    cta: z.string().optional(),
    caption: z.string().optional(),
  }).nullable(),
})

// --- Hook schemas ---
const HookResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  text: z.string(),
  format: z.string().nullable(),
  source: z.string(),
  performanceScore: z.number().nullable(),
  publicationCount: z.number(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
})

const HookBody = z.object({
  text: z.string().min(1),
  format: z.string().optional(),
})

const HookParams = z.object({ workspaceId: z.string(), hookId: z.string() })

// --- Serializers ---
function serializeTrend(t: {
  id: string
  workspaceId: string
  title: string
  description: string | null
  url: string | null
  source: string
  status: string
  relevanceScore: number | null
  category: string | null
  lifecycle: string | null
  sourceMetadata: unknown
  discoveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    title: t.title,
    description: t.description,
    url: t.url,
    source: t.source,
    status: t.status,
    relevanceScore: t.relevanceScore,
    category: t.category,
    lifecycle: (t.lifecycle as 'RISING' | 'PEAK' | 'DECLINING' | 'FLAT' | null) ?? null,
    sourceMetadata: t.sourceMetadata ?? null,
    discoveredAt: t.discoveredAt ? t.discoveredAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

function serializeIdea(i: {
  id: string
  workspaceId: string
  trendId: string
  title: string
  angle: string
  format: string
  platforms?: string[]
  platform?: string
  status: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: i.id,
    workspaceId: i.workspaceId,
    trendId: i.trendId,
    title: i.title,
    angle: i.angle,
    format: i.format,
    platform: i.platform ?? (i.platforms?.[0] ?? ''),
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

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
  submittedById: string | null
  brandCheckScore: number | null
  brandCheckNotes: string | null
  brandCheckCriteria: unknown
  parentId: string | null
  version: number
  lengthVariant: string | null
  hasTts: boolean | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    ideaId: s.ideaId,
    hook: s.hook,
    body: s.body,
    cta: s.cta,
    caption: s.caption,
    hashtags: s.hashtags,
    status: s.status,
    submittedById: s.submittedById,
    brandCheckScore: s.brandCheckScore,
    brandCheckNotes: s.brandCheckNotes,
    brandCheckCriteria: s.brandCheckCriteria ?? null,
    autoFixes: null,
    parentId: s.parentId,
    version: s.version,
    lengthVariant: (s.lengthVariant ?? null) as 'SHORT' | 'LONG' | null,
    hasTts: s.hasTts,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function serializeScriptVersion(v: {
  id: string
  scriptId: string
  version: number
  hook: string
  body: string
  cta: string
  captions: unknown
  createdAt: Date
  createdById: string | null
}) {
  return {
    id: v.id,
    scriptId: v.scriptId,
    version: v.version,
    hook: v.hook,
    body: v.body,
    cta: v.cta,
    captions: v.captions ?? null,
    createdAt: v.createdAt.toISOString(),
    createdById: v.createdById,
  }
}

function serializeHook(h: {
  id: string
  workspaceId: string
  text: string
  format: string | null
  source: string
  performanceScore: number | null
  publicationCount: number
  lastSeenAt: Date | null
  createdAt: Date
}) {
  return {
    id: h.id,
    workspaceId: h.workspaceId,
    text: h.text,
    format: h.format,
    source: h.source,
    performanceScore: h.performanceScore,
    publicationCount: h.publicationCount,
    lastSeenAt: h.lastSeenAt ? h.lastSeenAt.toISOString() : null,
    createdAt: h.createdAt.toISOString(),
  }
}

export const contentRoutes: FastifyPluginAsyncZod = async (app) => {
  // =====================
  // Trend routes
  // =====================

  app.post('/trends', {
    schema: {
      params: WorkspaceParams,
      body: TrendBody,
      response: {
        201: TrendResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { title, description, url, source } = request.body

    const trend = await prisma.trend.create({
      data: { workspaceId, title, description: description ?? null, url: url ?? null, source: source ?? 'manual' },
    })

    return reply.status(201).send(serializeTrend(trend))
  })

  app.get('/trends', {
    schema: {
      params: WorkspaceParams,
      querystring: TrendQuerystring,
      response: {
        200: z.array(TrendResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { status, source, minScore } = request.query
    const trends = await prisma.trend.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        // When no source filter is given, exclude wizard-created (adhoc) trends from the inbox.
        ...(source ? { source } : { source: { not: 'adhoc' } }),
        ...(minScore !== undefined ? { relevanceScore: { gte: minScore } } : {}),
      },
      orderBy: [
        { relevanceScore: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    })
    return trends.map(serializeTrend)
  })

  app.get('/trends/:trendId', {
    schema: {
      params: TrendParams,
      response: {
        200: TrendResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params
    const trend = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!trend) return reply.status(404).send({ error: 'Not found' })
    return serializeTrend(trend)
  })

  app.post('/trends/:trendId/archive', {
    schema: {
      params: TrendParams,
      response: {
        200: TrendResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params
    const existing = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    const trend = await prisma.trend.update({
      where: { id: trendId },
      data: { status: 'ARCHIVED' },
    })
    return reply.status(200).send(serializeTrend(trend))
  })

  // POST /workspaces/:workspaceId/trends/fetch (US-006)
  app.post('/trends/fetch', {
    schema: {
      params: WorkspaceParams,
      response: {
        202: z.object({ queued: z.literal(true), jobId: z.string() }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const job = await getTrendFetchQueue().add(
      'fetch-all-trends',
      { workspaceId, force: true },
    )
    return reply.status(202).send({ queued: true, jobId: String(job.id) })
  })

  app.post('/trends/:trendId/analyze', {
    schema: {
      params: TrendParams,
      response: {
        200: TrendResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params
    const existing = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const result = await analyzeTrend(workspaceId, {
      title: existing.title,
      ...(existing.description ? { description: existing.description } : {}),
      ...(existing.url ? { url: existing.url } : {}),
    })

    const score = Number.isFinite(result.score) ? Math.round(result.score) : null

    const trend = await prisma.trend.update({
      where: { id: trendId },
      data: {
        relevanceScore: score,
        ...(result.category ? { category: result.category } : {}),
        status: 'ANALYZED',
        ...(existing.discoveredAt === null ? { discoveredAt: new Date() } : {}),
      },
    })

    return reply.status(200).send(serializeTrend(trend))
  })

  // =====================
  // Trend feedback route (US-012)
  // =====================

  app.post('/trends/:trendId/feedback', {
    schema: {
      params: TrendParams,
      body: FeedbackBody,
      response: {
        200: FeedbackResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params
    const { signal } = request.body
    const userId = request.authUser?.userId
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const trend = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!trend) return reply.status(404).send({ error: 'Not found' })

    const feedback = await prisma.trendFeedback.upsert({
      where: { trendId_userId: { trendId, userId } },
      create: { workspaceId, trendId, userId, signal },
      update: { signal },
    })

    return reply.status(200).send({
      id: feedback.id,
      trendId: feedback.trendId,
      userId: feedback.userId,
      signal: feedback.signal,
      createdAt: feedback.createdAt.toISOString(),
    })
  })

  // =====================
  // Idea routes
  // =====================

  app.post('/trends/:trendId/ideas', {
    schema: {
      params: TrendParams,
      response: {
        201: z.array(IdeaResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params

    const trend = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!trend) return reply.status(404).send({ error: 'Not found' })

    const rawIdeas = await generateIdeas(workspaceId, { title: trend.title, ...(trend.description ? { description: trend.description } : {}) }, 7)

    await prisma.idea.createMany({
      data: rawIdeas.map((idea) => ({
        workspaceId,
        trendId,
        title: idea.title,
        angle: idea.angle,
        format: idea.format,
        platform: idea.platform,
        platforms: [idea.platform],
      })),
    })

    const ideas = await prisma.idea.findMany({ where: { trendId } })
    return reply.status(201).send(ideas.map(serializeIdea))
  })

  app.get('/ideas', {
    schema: {
      params: WorkspaceParams,
      querystring: IdeasQuerystring,
      response: {
        200: z.array(IdeaResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { trendId } = request.query
    const ideas = await prisma.idea.findMany({
      where: { workspaceId, ...(trendId ? { trendId } : {}) },
    })
    return ideas.map(serializeIdea)
  })

  app.get('/ideas/:ideaId', {
    schema: {
      params: IdeaParams,
      response: {
        200: IdeaResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, ideaId } = request.params
    const idea = await prisma.idea.findFirst({ where: { id: ideaId, workspaceId } })
    if (!idea) return reply.status(404).send({ error: 'Not found' })
    return serializeIdea(idea)
  })

  app.patch('/ideas/:ideaId/select', {
    schema: {
      params: IdeaParams,
      response: {
        200: IdeaResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, ideaId } = request.params

    const idea = await prisma.idea.findFirst({ where: { id: ideaId, workspaceId } })
    if (!idea) return reply.status(404).send({ error: 'Not found' })

    const [, updated] = await prisma.$transaction([
      prisma.idea.updateMany({
        where: { trendId: idea.trendId, id: { not: ideaId } },
        data: { status: 'REJECTED' },
      }),
      prisma.idea.update({
        where: { id: ideaId },
        data: { status: 'SELECTED' },
      }),
    ])

    return reply.status(200).send(serializeIdea(updated))
  })

  // =====================
  // Script routes
  // =====================

  app.post('/ideas/:ideaId/script', {
    schema: {
      params: IdeaParams,
      response: {
        201: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        409: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, ideaId } = request.params

    const idea = await prisma.idea.findFirst({ where: { id: ideaId, workspaceId } })
    if (!idea) return reply.status(404).send({ error: 'Not found' })

    const existing = await prisma.script.findUnique({ where: { ideaId } })
    if (existing) {
      return reply.status(409).send({ error: `Script already exists: ${existing.id}` })
    }

    const contentScript = await writeScript(workspaceId, {
      title: idea.title,
      angle: idea.angle,
      format: idea.format,
      platform: (idea as { platform?: string; platforms?: string[] }).platform ?? (idea as { platforms?: string[] }).platforms?.[0] ?? 'instagram',
    })

    const script = await prisma.script.create({
      data: {
        workspaceId,
        ideaId,
        hook: contentScript.hook,
        body: contentScript.body,
        cta: contentScript.cta,
        caption: contentScript.caption,
        hashtags: contentScript.hashtags,
      },
    })

    return reply.status(201).send(serializeScript(script))
  })

  app.get('/scripts', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(ScriptResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const scripts = await prisma.script.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return scripts.map(serializeScript)
  })

  app.get('/scripts/:scriptId', {
    schema: {
      params: ScriptParams,
      response: {
        200: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })
    return serializeScript(script)
  })

  app.post('/scripts/:scriptId/brand-check', {
    schema: {
      params: ScriptParams,
      response: {
        200: BrandCheckResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    let result: Awaited<ReturnType<typeof checkBrand>>
    try {
      result = await checkBrand(workspaceId, {
        hook: script.hook,
        body: script.body,
        cta: script.cta,
        caption: script.caption,
      })
    } catch {
      return reply.status(500).send({ error: 'Brand check failed' })
    }

    await prisma.script.update({
      where: { id: scriptId },
      data: {
        brandCheckScore: Math.round(result.overallScore),
        brandCheckNotes: result.summary,
        brandCheckCriteria: result.criteria as unknown as Prisma.JsonObject,
        status: 'BRAND_CHECKED',
      },
    })

    return reply.status(200).send({
      overallScore: result.overallScore,
      passed: result.passed,
      summary: result.summary,
      criteria: result.criteria,
      autoFixes: result.autoFixes ?? null,
    })
  })

  // POST /workspaces/:workspaceId/scripts/:scriptId/create-variant (US-022)
  app.post('/scripts/:scriptId/create-variant', {
    schema: {
      params: ScriptParams,
      body: CreateVariantBody,
      response: {
        201: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { lengthVariant, hasTts } = request.body

    const parent = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!parent) return reply.status(404).send({ error: 'Script not found' })

    // Derive altered script content based on lengthVariant
    let newHook = parent.hook
    let newBody = parent.body
    let newCta = parent.cta
    let newCaption = parent.caption
    let newHashtags = parent.hashtags

    if (lengthVariant === 'SHORT') {
      // Cut body to ~30% of original length
      const words = parent.body.split(' ')
      const cutoff = Math.max(1, Math.round(words.length * 0.3))
      newBody = words.slice(0, cutoff).join(' ')
    } else if (lengthVariant === 'LONG') {
      // Expand body via scriptwriter with an expansion instruction
      try {
        const parentIdeaId = parent.ideaId
        const idea = parentIdeaId ? await prisma.idea.findUnique({ where: { id: parentIdeaId } }) : null
        const expanded = await writeScript(workspaceId, {
          title: idea?.title ?? 'Content',
          angle: `EXPAND: Write a longer version (2x length) of this body: ${parent.body}`,
          format: idea?.format ?? 'video',
          platform: (idea as { platform?: string; platforms?: string[] } | null)?.platform ?? (idea as { platforms?: string[] } | null)?.platforms?.[0] ?? 'instagram',
        })
        newHook = expanded.hook
        newBody = expanded.body
        newCta = expanded.cta
        newCaption = expanded.caption
        newHashtags = expanded.hashtags
      } catch {
        return reply.status(500).send({ error: 'Script expansion failed' })
      }
    }

    const newScript = await prisma.script.create({
      data: {
        workspaceId,
        hook: newHook,
        body: newBody,
        cta: newCta,
        caption: newCaption,
        hashtags: newHashtags,
        parentId: parent.id,
        version: parent.version + 1,
        ...(lengthVariant !== undefined ? { lengthVariant } : {}),
        ...(hasTts !== undefined ? { hasTts } : {}),
      },
    })

    return reply.status(201).send(serializeScript(newScript))
  })

  // =====================
  // Hook routes
  // =====================

  app.get('/hooks', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(HookResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const hooks = await prisma.hook.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return hooks.map(serializeHook)
  })

  app.post('/hooks', {
    schema: {
      params: WorkspaceParams,
      body: HookBody,
      response: {
        201: HookResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const hook = await prisma.hook.create({
      data: {
        workspaceId: request.params.workspaceId,
        text: request.body.text,
        format: request.body.format ?? null,
      },
    })
    return reply.status(201).send(serializeHook(hook))
  })

  app.delete('/hooks/:hookId', {
    schema: {
      params: HookParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, hookId } = request.params
    const existing = await prisma.hook.findFirst({ where: { id: hookId, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Not found' })
    await prisma.hook.delete({ where: { id: hookId } })
    return reply.status(204).send(null)
  })
}
