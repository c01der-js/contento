import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@contento/db'
import { AssetKind } from '@contento/db'
import type { Prisma } from '@contento/db'
import multipart from '@fastify/multipart'
import { requireRole } from '../middleware/rbac.js'

// ── S3 client (MinIO-compatible) ──────────────────────────────────────────────

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'contento',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'contento123',
    },
    forcePathStyle: true, // required for MinIO
  })
}

function getS3Bucket(): string {
  return process.env.S3_BUCKET ?? 'contento-assets'
}

function buildPublicUrl(key: string): string {
  const endpoint = (process.env.S3_ENDPOINT ?? 'http://localhost:9000').replace(/\/$/, '')
  return `${endpoint}/${getS3Bucket()}/${key}`
}

const IMAGE_MIME_PREFIXES = ['image/']

function isImage(mimeType: string | undefined): boolean {
  if (!mimeType) return false
  return IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const WorkspaceParams = z.object({ workspaceId: z.string() })
const AssetParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const AssetKindEnum = z.enum(['BROLL', 'PRODUCT', 'REFERENCE', 'VOICE_SAMPLE', 'SCREENCAST'])

const AssetResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: AssetKindEnum,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  mimeType: z.string().nullable(),
  tags: z.array(z.string()),
  meta: z.unknown().nullable(),
  createdAt: z.string(),
})

const AssetListResponse = z.object({
  assets: z.array(AssetResponse),
  nextCursor: z.string().nullable(),
})

const AssetListQuerystring = z.object({
  kind: AssetKindEnum.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeAsset(a: {
  id: string
  workspaceId: string
  kind: AssetKind
  url: string
  thumbnailUrl: string | null
  mimeType: string | null
  tags: string[]
  meta: unknown
  createdAt: Date
}) {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    kind: a.kind,
    url: a.url,
    thumbnailUrl: a.thumbnailUrl,
    mimeType: a.mimeType,
    tags: a.tags,
    meta: a.meta ?? null,
    createdAt: a.createdAt.toISOString(),
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export const assetRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  // POST /workspaces/:workspaceId/assets — multipart upload
  app.post('/assets', {
    schema: {
      params: WorkspaceParams,
      response: {
        201: AssetResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }

    // Parse fields alongside file
    const fields = data.fields as Record<string, { value: string } | undefined>

    const rawKind = (fields['kind']?.value ?? '').toUpperCase()
    const kindParse = AssetKindEnum.safeParse(rawKind)
    if (!kindParse.success) {
      return reply.status(400).send({ error: `Invalid or missing kind. Must be one of: BROLL, PRODUCT, REFERENCE, VOICE_SAMPLE, SCREENCAST` })
    }
    const kind = kindParse.data as AssetKind

    let tags: string[] = []
    const rawTags = fields['tags']?.value
    if (rawTags) {
      try {
        const parsed = JSON.parse(rawTags)
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t): t is string => typeof t === 'string')
        }
      } catch {
        // ignore malformed tags
      }
    }

    let meta: Record<string, unknown> | null = null
    const rawMeta = fields['meta']?.value
    if (rawMeta) {
      try {
        const parsed = JSON.parse(rawMeta)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>
        }
      } catch {
        // ignore malformed meta
      }
    }

    // Generate a stable asset ID up-front so the S3 key references it
    const { randomUUID } = await import('crypto')
    const assetId = randomUUID()

    const filename = data.filename || 'upload'
    const s3Key = `${workspaceId}/${assetId}/${filename}`
    const mimeType = data.mimetype || null

    // Upload to MinIO/S3
    const s3 = buildS3Client()
    const fileBuffer = await data.toBuffer()

    await s3.send(
      new PutObjectCommand({
        Bucket: getS3Bucket(),
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType ?? 'application/octet-stream',
        ContentLength: fileBuffer.byteLength,
      }),
    )

    const url = buildPublicUrl(s3Key)
    // Thumbnail: same URL for images, null for everything else (async gen out of scope)
    const thumbnailUrl = isImage(mimeType ?? undefined) ? url : null

    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        workspaceId,
        kind,
        url,
        thumbnailUrl,
        mimeType,
        tags,
        ...(meta !== null ? { meta: meta as Prisma.InputJsonValue } : {}),
      },
    })

    return reply.status(201).send(serializeAsset(asset))
  })

  // GET /workspaces/:workspaceId/assets — list with optional ?kind= filter and cursor pagination
  app.get('/assets', {
    schema: {
      params: WorkspaceParams,
      querystring: AssetListQuerystring,
      response: {
        200: AssetListResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { kind, cursor, limit } = request.query

    const assets = await prisma.asset.findMany({
      where: {
        workspaceId,
        ...(kind ? { kind: kind as AssetKind } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    let nextCursor: string | null = null
    if (assets.length > limit) {
      const last = assets.pop()!
      nextCursor = last.id
    }

    return {
      assets: assets.map(serializeAsset),
      nextCursor,
    }
  })

  // DELETE /workspaces/:workspaceId/assets/:id
  app.delete('/assets/:id', {
    schema: {
      params: AssetParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params

    const asset = await prisma.asset.findFirst({ where: { id, workspaceId } })
    if (!asset) return reply.status(404).send({ error: 'Asset not found' })

    // Derive the S3 key from the stored URL
    const endpoint = (process.env.S3_ENDPOINT ?? 'http://localhost:9000').replace(/\/$/, '')
    const bucket = getS3Bucket()
    const prefix = `${endpoint}/${bucket}/`
    const s3Key = asset.url.startsWith(prefix) ? asset.url.slice(prefix.length) : null

    if (s3Key) {
      const s3 = buildS3Client()
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        }),
      )
    }

    await prisma.asset.delete({ where: { id } })

    return reply.status(204).send(null)
  })
}
