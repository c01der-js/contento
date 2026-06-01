import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { writeScript, generateIdeas, convertFormat, buildBrandContext } from '@contento/ai'
import { planSeries } from '@contento/ai'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })
const TrendParams = z.object({ workspaceId: z.string(), trendId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ScriptRef = z.object({ id: z.string(), hook: z.string(), status: z.string(), createdAt: z.string() })

export const quickActionRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /scripts/:scriptId/re-platform
  app.post('/scripts/:scriptId/re-platform', {
    schema: {
      params: ScriptParams,
      body: z.object({ targetPlatform: z.string() }),
      response: { 201: ScriptRef, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { targetPlatform } = request.body

    const src = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!src) return reply.status(404).send({ error: 'Script not found' })

    const brandContext = await buildBrandContext(workspaceId)
    const converted = await convertFormat(
      { hook: src.hook, body: src.body, cta: src.cta },
      targetPlatform,
      brandContext,
    )
    const newScript = await prisma.script.create({
      data: {
        workspaceId,
        hook: converted.hook,
        body: converted.body,
        cta: converted.cta,
        caption: converted.captions['caption'] ?? src.caption,
        hashtags: src.hashtags,
        status: 'DRAFT',
        parentId: scriptId,
        version: 1,
      },
    })
    return reply.status(201).send({ id: newScript.id, hook: newScript.hook, status: newScript.status, createdAt: newScript.createdAt.toISOString() })
  })

  // POST /quick/urgent
  app.post('/quick/urgent', {
    schema: {
      params: WorkspaceParams,
      body: z.object({ topic: z.string().min(1), platforms: z.array(z.string()).min(1) }),
      response: { 201: z.object({ scriptId: z.string(), publicationId: z.string(), scheduledAt: z.string() }), 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { topic, platforms } = request.body

    const socialAccount = await prisma.socialAccount.findFirst({ where: { workspaceId } })
    if (!socialAccount) return reply.status(400).send({ error: 'No social account connected' })

    const scriptData = await writeScript(workspaceId, {
      title: topic,
      angle: 'urgent trending topic',
      format: 'Reels',
      platform: platforms[0] ?? 'instagram',
    })

    const script = await prisma.script.create({
      data: {
        workspaceId,
        hook: scriptData.hook,
        body: scriptData.body,
        cta: scriptData.cta,
        caption: scriptData.caption,
        hashtags: scriptData.hashtags,
        status: 'APPROVED',
      },
    })

    const scheduledAt = new Date(Date.now() + 15 * 60 * 1000)
    const pub = await prisma.publication.create({
      data: { workspaceId, scriptId: script.id, socialAccountId: socialAccount.id, scheduledAt, status: 'PENDING' },
    })

    return reply.status(201).send({ scriptId: script.id, publicationId: pub.id, scheduledAt: scheduledAt.toISOString() })
  })

  // POST /quick/series
  app.post('/quick/series', {
    schema: {
      params: WorkspaceParams,
      body: z.object({ topic: z.string().min(1), count: z.number().int().min(2).max(10).default(5), platforms: z.array(z.string()).min(1) }),
      response: { 201: z.object({ scripts: z.array(z.object({ id: z.string(), hook: z.string(), order: z.number() })) }), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { topic, count, platforms } = request.body

    const episodes = await planSeries(workspaceId, topic, count)
    const results: { id: string; hook: string; order: number }[] = []

    for (const ep of episodes) {
      const scriptData = await writeScript(workspaceId, {
        title: ep.title,
        angle: ep.angle,
        format: ep.format,
        platform: platforms[0] ?? ep.platform,
      })
      const script = await prisma.script.create({
        data: {
          workspaceId,
          hook: scriptData.hook,
          body: scriptData.body,
          cta: scriptData.cta,
          caption: scriptData.caption,
          hashtags: scriptData.hashtags,
          status: 'DRAFT',
        },
      })
      results.push({ id: script.id, hook: script.hook, order: ep.order })
    }

    return reply.status(201).send({ scripts: results })
  })

  // POST /quick/repost-top
  app.post('/quick/repost-top', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({ period: z.enum(['7d', '30d', '90d']).default('30d') }),
      response: { 201: z.object({ scriptId: z.string(), originalScriptId: z.string(), originalPublicationId: z.string() }), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { period } = request.query
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    const since = new Date(Date.now() - days * 86400 * 1000)

    const pubs = await prisma.publication.findMany({
      where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: since } },
      include: { script: true },
    })
    if (!pubs.length) return reply.status(404).send({ error: 'No published posts in period' })

    const top = pubs.reduce((best, p) => {
      const er = (p.metrics as Record<string, unknown> | null)?.['er']
      const bestEr = (best.metrics as Record<string, unknown> | null)?.['er']
      return Number(er ?? 0) > Number(bestEr ?? 0) ? p : best
    })

    const brandContext = await buildBrandContext(workspaceId)
    const converted = await convertFormat(
      { hook: 'Fresh take: ' + top.script.hook, body: top.script.body, cta: top.script.cta },
      'Reels',
      brandContext,
    )
    const newScript = await prisma.script.create({
      data: {
        workspaceId,
        hook: converted.hook,
        body: converted.body,
        cta: converted.cta,
        caption: converted.captions['caption'] ?? top.script.caption,
        hashtags: top.script.hashtags,
        status: 'DRAFT',
        parentId: top.scriptId,
        version: 1,
      },
    })
    return reply.status(201).send({ scriptId: newScript.id, originalScriptId: top.scriptId, originalPublicationId: top.id })
  })

  // POST /trends/:trendId/quick/react
  app.post('/trends/:trendId/quick/react', {
    schema: {
      params: TrendParams,
      response: { 201: z.object({ scriptId: z.string(), publicationId: z.string(), scheduledAt: z.string(), trendId: z.string() }), 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, 500: ErrorResponse },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, trendId } = request.params

    const trend = await prisma.trend.findFirst({ where: { id: trendId, workspaceId } })
    if (!trend) return reply.status(404).send({ error: 'Trend not found' })

    const socialAccount = await prisma.socialAccount.findFirst({ where: { workspaceId } })
    if (!socialAccount) return reply.status(400).send({ error: 'No social account connected' })

    const ideas = await generateIdeas(workspaceId, { title: trend.title }, 1)
    const idea = ideas[0]
    if (!idea) return reply.status(500).send({ error: 'Failed to generate idea' })

    const scriptData = await writeScript(workspaceId, {
      title: idea.title,
      angle: idea.angle,
      format: idea.format,
      platform: idea.platform,
    })
    const script = await prisma.script.create({
      data: {
        workspaceId,
        hook: scriptData.hook,
        body: scriptData.body,
        cta: scriptData.cta,
        caption: scriptData.caption,
        hashtags: scriptData.hashtags,
        status: 'APPROVED',
      },
    })

    const scheduledAt = new Date(Date.now() + 15 * 60 * 1000)
    const pub = await prisma.publication.create({
      data: { workspaceId, scriptId: script.id, socialAccountId: socialAccount.id, scheduledAt, status: 'PENDING' },
    })

    return reply.status(201).send({ scriptId: script.id, publicationId: pub.id, scheduledAt: scheduledAt.toISOString(), trendId })
  })
}
