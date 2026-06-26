import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireReadRole, requireWriteRole } from '../middleware/rbac.js'
import { storyToScript } from '@contento/ai'
import * as cheerio from 'cheerio'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const StoryParams = z.object({ workspaceId: z.string(), storyId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// Shared list-item shape — returned by GET /stories, POST /stories, POST /stories/scrape
const StoryListItem = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  scriptCount: z.number(),
})

const StoryDetailResponse = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().nullable(),
  rawText: z.string(),
  status: z.string(),
  createdAt: z.string(),
  scripts: z.array(z.object({ id: z.string(), hook: z.string(), status: z.string() })),
})

const GenerateScriptResponse = z.object({
  script: z.object({
    id: z.string(),
    hook: z.string(),
    body: z.string(),
    cta: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
    status: z.string(),
    createdAt: z.string(),
  }),
})

// --- SSRF guard ---
const PRIVATE_HOSTNAME_RE = /^(localhost|::1)$/i
const PRIVATE_IP_RE = /^(127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

function isSsrfBlocked(hostname: string): boolean {
  if (PRIVATE_HOSTNAME_RE.test(hostname)) return true
  if (PRIVATE_IP_RE.test(hostname)) return true
  return false
}

// Derive a title from the first non-empty line of rawText, capped at 120 chars.
function deriveTitle(rawText: string): string {
  const firstLine = rawText
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? 'Без названия'
  return firstLine.slice(0, 120)
}

function toListItem(
  story: { id: string; title: string; sourceUrl: string | null; status: string; createdAt: Date },
  scriptCount: number,
): z.infer<typeof StoryListItem> {
  return {
    id: story.id,
    title: story.title,
    sourceUrl: story.sourceUrl,
    status: story.status,
    createdAt: story.createdAt.toISOString(),
    scriptCount,
  }
}

export const storyRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /stories — list, newest first
  app.get('/stories', {
    schema: {
      params: WorkspaceParams,
      response: { 200: z.array(StoryListItem), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const stories = await prisma.story.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        status: true,
        createdAt: true,
        _count: { select: { scripts: true } },
      },
    })

    return reply.status(200).send(
      stories.map((s) => toListItem(s, s._count.scripts)),
    )
  })

  // POST /stories — create from raw text
  app.post('/stories', {
    schema: {
      params: WorkspaceParams,
      body: z.object({
        title: z.string().optional(),
        rawText: z.string().min(1),
      }),
      response: { 201: StoryListItem, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { rawText } = request.body
    const title =
      request.body.title && request.body.title.trim().length > 0
        ? request.body.title.trim().slice(0, 120)
        : deriveTitle(rawText)

    const story = await prisma.story.create({
      data: { workspaceId, title, rawText },
    })

    return reply.status(201).send(toListItem(story, 0))
  })

  // POST /stories/scrape — fetch URL, extract text, create Story
  app.post('/stories/scrape', {
    schema: {
      params: WorkspaceParams,
      body: z.object({ url: z.string().url() }),
      response: {
        201: StoryListItem,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { url } = request.body

    // SSRF guard — only http/https, no private/loopback addresses
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return reply.status(400).send({ error: 'Invalid URL' })
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return reply.status(400).send({ error: 'Only http and https URLs are allowed' })
    }

    if (isSsrfBlocked(parsed.hostname)) {
      return reply.status(400).send({ error: 'Requests to private/loopback addresses are not allowed' })
    }

    // Fetch the page
    let html: string
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentoBot/1.0)' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!resp.ok) {
        return reply.status(400).send({ error: `Fetch failed: HTTP ${resp.status}` })
      }
      html = await resp.text()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(400).send({ error: `Fetch error: ${msg}` })
    }

    // Extract readable text with cheerio
    const $ = cheerio.load(html)
    $('script, style, noscript, nav, footer, header, svg, iframe').remove()

    const container = $('article').first().length
      ? $('article').first()
      : $('main').first().length
        ? $('main').first()
        : $('body')

    const rawText = (container.text() ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20_000)

    if (!rawText) {
      return reply.status(400).send({ error: 'Could not extract readable text from the page' })
    }

    // Derive title from <title> or first <h1>, fallback to hostname
    const pageTitle =
      $('title').first().text().trim() ||
      $('h1').first().text().trim() ||
      parsed.hostname

    const story = await prisma.story.create({
      data: {
        workspaceId,
        title: pageTitle.slice(0, 120),
        sourceUrl: url,
        rawText,
      },
    })

    return reply.status(201).send(toListItem(story, 0))
  })

  // GET /stories/:storyId — detail with related scripts
  app.get('/stories/:storyId', {
    schema: {
      params: StoryParams,
      response: {
        200: StoryDetailResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, storyId } = request.params

    const story = await prisma.story.findFirst({
      where: { id: storyId, workspaceId },
      include: {
        scripts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, hook: true, status: true },
        },
      },
    })

    if (!story) {
      return reply.status(404).send({ error: 'Story not found' })
    }

    return reply.status(200).send({
      id: story.id,
      title: story.title,
      sourceUrl: story.sourceUrl,
      rawText: story.rawText,
      status: story.status,
      createdAt: story.createdAt.toISOString(),
      scripts: story.scripts.map((s) => ({
        id: s.id,
        hook: s.hook,
        status: s.status,
      })),
    })
  })

  // DELETE /stories/:storyId
  app.delete('/stories/:storyId', {
    schema: {
      params: StoryParams,
      response: {
        200: z.object({ ok: z.literal(true) }),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, storyId } = request.params

    const story = await prisma.story.findFirst({ where: { id: storyId, workspaceId } })
    if (!story) {
      return reply.status(404).send({ error: 'Story not found' })
    }

    await prisma.story.delete({ where: { id: storyId } })
    return reply.status(200).send({ ok: true })
  })

  // POST /stories/:storyId/generate — AI script generation from story
  app.post('/stories/:storyId/generate', {
    schema: {
      params: StoryParams,
      body: z.object({
        format: z.string().optional(),
        platform: z.string().optional(),
      }),
      response: {
        201: GenerateScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, storyId } = request.params
    const { format, platform } = request.body

    const story = await prisma.story.findFirst({ where: { id: storyId, workspaceId } })
    if (!story) {
      return reply.status(404).send({ error: 'Story not found' })
    }

    const { hook, body, cta, caption, hashtags } = await storyToScript(workspaceId, {
      storyText: story.rawText,
      ...(format ? { format } : {}),
      ...(platform ? { platform } : {}),
    })

    const [script] = await prisma.$transaction([
      prisma.script.create({
        data: {
          workspaceId,
          storyId,
          hook,
          body,
          cta,
          caption,
          hashtags,
          status: 'DRAFT',
        },
      }),
      prisma.story.update({
        where: { id: storyId },
        data: { status: 'USED' },
      }),
    ])

    return reply.status(201).send({
      script: {
        id: script.id,
        hook: script.hook,
        body: script.body,
        cta: script.cta,
        caption: script.caption,
        hashtags: script.hashtags,
        status: script.status,
        createdAt: script.createdAt.toISOString(),
      },
    })
  })
}
