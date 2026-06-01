import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '@contento/db'

// Map URL path segments to entity type labels
const PATH_ENTITY_MAP: Array<[RegExp, string]> = [
  [/\/scripts\//, 'SCRIPT'],
  [/\/ideas\//, 'IDEA'],
  [/\/trends\//, 'TREND'],
  [/\/publications\//, 'PUBLICATION'],
  [/\/tasks\//, 'TASK'],
  [/\/projects\//, 'PROJECT'],
  [/\/brand-kit\//, 'BRAND_KIT'],
  [/\/render-jobs\//, 'RENDER_JOB'],
  [/\/social-accounts\//, 'SOCIAL_ACCOUNT'],
  [/\/members\//, 'MEMBER'],
  [/\/scripts$/, 'SCRIPT'],
  [/\/ideas$/, 'IDEA'],
  [/\/trends$/, 'TREND'],
  [/\/publications$/, 'PUBLICATION'],
  [/\/tasks$/, 'TASK'],
  [/\/projects$/, 'PROJECT'],
]

function deriveEntityType(url: string): string {
  for (const [pattern, entityType] of PATH_ENTITY_MAP) {
    if (pattern.test(url)) return entityType
  }
  // Fallback: use last meaningful path segment
  const segments = url.split('/').filter(Boolean)
  return (segments[segments.length - 1] ?? 'UNKNOWN').toUpperCase().replace(/-/g, '_')
}

function deriveAction(method: string): 'CREATE' | 'UPDATE' | 'DELETE' | null {
  switch (method.toUpperCase()) {
    case 'POST': return 'CREATE'
    case 'PATCH':
    case 'PUT': return 'UPDATE'
    case 'DELETE': return 'DELETE'
    default: return null
  }
}

// Extract entity ID from URL: the segment after the entity type segment
function deriveEntityId(url: string, params: Record<string, string>): string {
  // Try known param names in order of preference
  return (
    params['scriptId'] ??
    params['ideaId'] ??
    params['trendId'] ??
    params['taskId'] ??
    params['projectId'] ??
    params['publicationId'] ??
    params['id'] ??
    'unknown'
  )
}

export const registerActivityLogger = fp(async (app: FastifyInstance) => {
  app.addHook('onResponse', async (request, reply) => {
    // Only log mutating methods with 2xx responses
    const action = deriveAction(request.method)
    if (!action) return
    if (reply.statusCode < 200 || reply.statusCode >= 300) return

    const params = (request.params ?? {}) as Record<string, string>
    const workspaceId = params['workspaceId']
    if (!workspaceId) return

    const actorId = request.authUser?.userId ?? null
    const entityType = deriveEntityType(request.url)
    const entityId = deriveEntityId(request.url, params)

    // Fire-and-forget — do not block response
    prisma.activityLog.create({
      data: {
        workspaceId,
        actorId,
        action,
        entityType,
        entityId,
        meta: {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
        },
      },
    }).catch((err: unknown) => {
      app.log.error({ err }, '[activity-logger] Failed to write activity log')
    })
  })
})
