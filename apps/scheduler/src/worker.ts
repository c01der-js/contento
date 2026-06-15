import { Queue, Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { createKafkaClient, TypedProducer, TOPIC_PUBLISH } from '@contento/shared'

const QUEUE_NAME = 'scheduled-publish'
const OAUTH_REFRESH_QUEUE = 'oauth-refresh'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3001'

// Token expiry threshold: refresh if expires within 1 hour
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000

let _redis: IORedis | null = null
function getRedis() {
  if (!_redis) _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  return _redis
}

// Kafka producer (lazy)
let _producer: TypedProducer | null = null
function getProducer() {
  if (!_producer) {
    _producer = new TypedProducer(createKafkaClient({ clientId: 'scheduler' }))
  }
  return _producer
}

export const queue = new Queue(QUEUE_NAME, { connection: getRedis() })

// Schedule jobs for all PENDING publications with scheduledAt set
export async function syncScheduledJobs() {
  const publications = await prisma.publication.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { not: null },
    },
    select: {
      id: true,
      workspaceId: true,
      socialAccountId: true,
      scheduledAt: true,
    },
    // Load platform separately to avoid the socialAccount relation TS complexity
  })

  // Resolve platforms for each publication
  const platformMap = new Map<string, string>()
  const accountIds = [...new Set(publications.map((p) => p.socialAccountId))]
  if (accountIds.length > 0) {
    const accounts = await prisma.socialAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, platform: true },
    })
    for (const a of accounts) platformMap.set(a.id, a.platform)
  }

  for (const pub of publications) {
    const platform = platformMap.get(pub.socialAccountId)
    if (!platform) continue

    const delay =
      pub.scheduledAt! > new Date()
        ? pub.scheduledAt!.getTime() - Date.now()
        : 0

    // Use publicationId as job id to prevent duplicates
    await queue.add(
      'publish',
      {
        publicationId: pub.id,
        workspaceId: pub.workspaceId,
        socialAccountId: pub.socialAccountId,
        platform,
      },
      { jobId: pub.id, delay },
    )
  }
}

export function createWorker() {
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      const { publicationId, workspaceId, platform } = job.data

      // Double-check publication is still PENDING (not cancelled/already published)
      const pub = await prisma.publication.findUnique({
        where: { id: publicationId },
        select: { status: true },
      })
      if (!pub || pub.status !== 'PENDING') return

      await getProducer().send(TOPIC_PUBLISH, {
        eventId: crypto.randomUUID(),
        workspaceId,
        timestamp: new Date().toISOString(),
        publicationId,
        platform,
      })
    },
    { connection: getRedis() },
  )
}

export { getProducer }

// ---------------------------------------------------------------------------
// OAuth token refresh — repeatable every 30 minutes
// ---------------------------------------------------------------------------

export const oauthRefreshQueue = new Queue(OAUTH_REFRESH_QUEUE, { connection: getRedis() })

export async function startOauthRefreshRepeatable() {
  await oauthRefreshQueue.add(
    'refresh-expiring-tokens',
    {},
    {
      jobId: 'oauth-refresh-repeatable',
      repeat: { pattern: '*/30 * * * *' },
    },
  )
}

export function createOauthRefreshWorker() {
  return new Worker(
    OAUTH_REFRESH_QUEUE,
    async () => {
      const now = Date.now()
      const threshold = now + REFRESH_THRESHOLD_MS

      // Find SocialAccounts where credentials.expires_at < threshold
      // Prisma JSON path filtering isn't supported for arbitrary JSON fields,
      // so we load all accounts and filter in-process (set is small in practice).
      const accounts = await prisma.socialAccount.findMany({
        select: { id: true, platform: true, credentials: true },
      })

      const expiring = accounts.filter((a) => {
        const creds = a.credentials as Record<string, unknown>
        const expiresAt = creds['expires_at']
        if (typeof expiresAt !== 'number') return false
        return expiresAt < threshold
      })

      await Promise.allSettled(
        expiring.map(async (account) => {
          try {
            const res = await fetch(
              `${INTERNAL_API_URL}/oauth/${account.platform}/refresh`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ socialAccountId: account.id }),
                signal: AbortSignal.timeout(15_000),
              },
            )
            if (!res.ok) {
              console.error(`OAuth refresh failed for account ${account.id}: HTTP ${res.status}`)
            }
          } catch (err) {
            console.error(`OAuth refresh error for account ${account.id}:`, err)
          }
        }),
      )
    },
    { connection: getRedis() },
  )
}
