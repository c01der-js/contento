import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { clickhouseQuery } from '../clickhouse.js'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string().min(1).max(64).regex(/^[a-z0-9]+$/) })
const ErrorResponse = z.object({ error: z.string() })

export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/analytics/summary', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.object({
          trends: z.number(),
          ideas: z.number(),
          scripts: z.number(),
          publications: z.number(),
        }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const [trends, ideas, scripts, publications] = await Promise.all([
      prisma.trend.count({ where: { workspaceId } }),
      prisma.idea.count({ where: { workspaceId } }),
      prisma.script.count({ where: { workspaceId } }),
      prisma.publication.count({ where: { workspaceId } }),
    ])
    return { trends, ideas, scripts, publications }
  })

  app.get('/analytics/publications', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({
        period: z.enum(['7d', '30d', '90d']).optional(),
      }),
      response: {
        200: z.array(z.object({ platform: z.string(), count: z.number() })),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { period = '30d' } = request.query
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90

    try {
      const rows = await clickhouseQuery<{ platform: string; count: string }>(
        `SELECT platform, count() AS count
         FROM publication_events
         WHERE workspace_id = {workspaceId:String}
           AND published_at >= now() - INTERVAL {days:UInt32} DAY
         GROUP BY platform
         ORDER BY count DESC`,
        { workspaceId, days },
      )
      return rows.map(r => ({ platform: r.platform, count: Number(r.count) }))
    } catch (err) {
      request.log.error(err, 'clickhouse publications query failed')
      throw err
    }
  })

  app.get('/analytics/attribution', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(z.object({
          platform: z.string(),
          format: z.string(),
          count: z.number(),
        })),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params

    try {
      const rows = await clickhouseQuery<{ platform: string; format: string; count: string }>(
        `SELECT platform, format, count() AS count
         FROM publication_events
         WHERE workspace_id = {workspaceId:String}
         GROUP BY platform, format
         ORDER BY count DESC
         LIMIT 20`,
        { workspaceId },
      )
      return rows.map(r => ({ platform: r.platform, format: r.format, count: Number(r.count) }))
    } catch (err) {
      request.log.error(err, 'clickhouse attribution query failed')
      throw err
    }
  })

  app.get('/analytics/llm-usage', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({
        period: z.enum(['7d', '30d']).optional(),
      }),
      response: {
        200: z.array(z.object({
          agent: z.string(),
          model: z.string(),
          calls: z.number(),
          totalCostUsd: z.number(),
        })),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { period = '30d' } = request.query
    const days = period === '7d' ? 7 : 30

    try {
      const rows = await clickhouseQuery<{ agent: string; model: string; calls: string; total_cost: string }>(
        `SELECT agent, model, count() AS calls, sum(cost_usd) AS total_cost
         FROM llm_usage_events
         WHERE workspace_id = {workspaceId:String}
           AND called_at >= now() - INTERVAL {days:UInt32} DAY
         GROUP BY agent, model
         ORDER BY total_cost DESC`,
        { workspaceId, days },
      )
      return rows.map(r => ({
        agent: r.agent,
        model: r.model,
        calls: Number(r.calls),
        totalCostUsd: Number(r.total_cost),
      }))
    } catch (err) {
      request.log.error(err, 'clickhouse llm-usage query failed')
      throw err
    }
  })

  // GET /analytics/followers
  app.get('/analytics/followers', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({
        range: z.enum(['7d', '30d', '90d']).default('30d'),
        socialAccountId: z.string().optional(),
      }),
      response: {
        200: z.object({ snapshots: z.array(z.object({ date: z.string(), followerCount: z.number(), platform: z.string() })) }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { range, socialAccountId } = request.query
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const since = new Date(Date.now() - days * 86400 * 1000)

    const snapshots = await prisma.socialAccountSnapshot.findMany({
      where: {
        ...(socialAccountId ? { socialAccountId } : {}),
        socialAccount: { workspaceId },
        date: { gte: since },
      },
      include: { socialAccount: { select: { platform: true } } },
      orderBy: { date: 'asc' },
    })

    return {
      snapshots: snapshots.map(s => ({
        date: s.date.toISOString(),
        followerCount: s.followerCount,
        platform: s.socialAccount.platform,
      })),
    }
  })

  // GET /analytics/by-pillar
  app.get('/analytics/by-pillar', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(z.object({ pillarId: z.string(), pillarName: z.string(), publicationCount: z.number() })),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params

    const pillars = await prisma.brandPillar.findMany({ where: { workspaceId } })
    const results = await Promise.all(pillars.map(async p => {
      const count = await prisma.publication.count({
        where: { workspaceId, status: 'PUBLISHED', script: { idea: { pillarId: p.id } } },
      })
      return { pillarId: p.id, pillarName: p.name, publicationCount: count }
    }))

    return results
  })

  // GET /analytics/metrics
  app.get('/analytics/metrics', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({
        period: z.enum(['7d', '30d', '90d']).default('30d'),
        prevPeriod: z.enum(['true', 'false']).default('false'),
        platform: z.string().optional(),
      }),
      response: {
        200: z.object({
          current: z.object({ reach: z.number(), impressions: z.number(), likes: z.number(), er: z.number() }),
          previous: z.object({ reach: z.number(), impressions: z.number(), likes: z.number(), er: z.number() }).optional(),
          delta: z.object({ reach: z.number(), impressions: z.number(), likes: z.number(), er: z.number() }).optional(),
        }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { period, prevPeriod, platform } = request.query
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90

    function aggregateMetrics(pubs: { metrics: unknown }[]) {
      let reach = 0, impressions = 0, likes = 0, er = 0, n = 0
      for (const p of pubs) {
        const m = p.metrics as Record<string, unknown> | null
        if (!m) continue
        reach += Number(m['reach'] ?? 0)
        impressions += Number(m['impressions'] ?? 0)
        likes += Number(m['likes'] ?? 0)
        er += Number(m['er'] ?? 0)
        n++
      }
      return { reach, impressions, likes, er: n > 0 ? er / n : 0 }
    }

    const since = new Date(Date.now() - days * 86400 * 1000)
    const where = {
      workspaceId,
      status: 'PUBLISHED' as const,
      publishedAt: { gte: since },
      ...(platform ? { socialAccount: { platform } } : {}),
    }
    const current = aggregateMetrics(await prisma.publication.findMany({ where, select: { metrics: true } }))

    if (prevPeriod !== 'true') return { current }

    const prevSince = new Date(since.getTime() - days * 86400 * 1000)
    const prevWhere = { ...where, publishedAt: { gte: prevSince, lt: since } }
    const previous = aggregateMetrics(await prisma.publication.findMany({ where: prevWhere, select: { metrics: true } }))
    const delta = {
      reach: current.reach - previous.reach,
      impressions: current.impressions - previous.impressions,
      likes: current.likes - previous.likes,
      er: current.er - previous.er,
    }

    return { current, previous, delta }
  })

  // GET /analytics/export
  app.get('/analytics/export', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({ format: z.enum(['csv', 'json']).default('csv') }),
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { format } = request.query
    const since = new Date(Date.now() - 90 * 86400 * 1000)

    const pubs = await prisma.publication.findMany({
      where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: since } },
      include: { script: { select: { hook: true } }, socialAccount: { select: { platform: true } } },
      orderBy: { publishedAt: 'desc' },
    })

    if (format === 'json') {
      return reply.send(pubs.map(p => ({
        date: p.publishedAt?.toISOString(),
        platform: p.socialAccount.platform,
        hook: p.script.hook,
        metrics: p.metrics,
      })))
    }

    const rows = pubs.map(p => {
      const m = p.metrics as Record<string, unknown> | null
      return [
        p.publishedAt?.toISOString() ?? '',
        p.socialAccount.platform,
        JSON.stringify(p.script.hook).replace(/,/g, ';'),
        String(m?.['reach'] ?? ''),
        String(m?.['impressions'] ?? ''),
        String(m?.['likes'] ?? ''),
        String(m?.['er'] ?? ''),
      ].join(',')
    })
    const csv = ['date,platform,hook,reach,impressions,likes,er', ...rows].join('\n')
    return reply.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="analytics.csv"').send(csv)
  })

  // GET /analytics/recommendations
  app.get('/analytics/recommendations', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.object({ recommendations: z.array(z.string()) }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params

    const [pillars, recentPubs, trends] = await Promise.all([
      prisma.brandPillar.findMany({ where: { workspaceId }, select: { name: true } }),
      prisma.publication.findMany({
        where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: new Date(Date.now() - 30 * 86400 * 1000) } },
        select: { metrics: true },
        take: 20,
      }),
      prisma.trend.findMany({ where: { workspaceId, status: 'ANALYZED' }, select: { title: true }, take: 5, orderBy: { relevanceScore: 'desc' } }),
    ])

    const { getRecommendations } = await import('@contento/ai')
    const recommendations = await getRecommendations(workspaceId, {
      topPillars: pillars.map(p => p.name),
      recentMetrics: recentPubs.map(p => p.metrics),
      trendTitles: trends.map(t => t.title),
    })

    return { recommendations }
  })
}
