import { prisma } from '@contento/db'
import { createPublisher } from '@contento/platforms'

async function ingestFollowerCounts(): Promise<void> {
  const accounts = await prisma.socialAccount.findMany()
  for (const account of accounts) {
    try {
      const creds = account.credentials as Record<string, string>
      let followerCount = 0

      if (account.platform === 'instagram' || account.platform === 'facebook') {
        const token = creds['accessToken']
        const userId = creds['userId']
        if (!token || !userId) continue
        const res = await fetch(
          `https://graph.facebook.com/v20.0/${userId}?fields=followers_count,follows_count&access_token=${token}`,
        )
        if (!res.ok) continue
        const data = (await res.json()) as { followers_count?: number }
        followerCount = data.followers_count ?? 0
      } else {
        // Other platforms: skip silently
        continue
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      await prisma.socialAccountSnapshot.upsert({
        where: { socialAccountId_date: { socialAccountId: account.id, date: today } },
        create: { socialAccountId: account.id, followerCount, date: today },
        update: { followerCount },
      })
    } catch {
      // Isolate per-account failures
    }
  }
}

/**
 * Daily per-publication metrics. For each recently-published Publication, ask the
 * platform publisher for current metrics (only YouTube returns real data today) and
 * record a PublicationMetric snapshot keyed (publicationId, date). Also syncs the
 * latest snapshot into Publication.metrics so the existing analytics dashboard
 * (which reads { reach, impressions, likes, er }) keeps working unchanged.
 */
async function ingestPublicationMetrics(): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // last 30 days
  const pubs = await prisma.publication.findMany({
    where: { status: 'PUBLISHED', platformPostId: { not: null }, publishedAt: { gte: since } },
    include: { socialAccount: true },
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const pub of pubs) {
    try {
      if (!pub.socialAccount || !pub.platformPostId) continue
      const publisher = createPublisher(
        pub.socialAccount.platform,
        pub.socialAccount.credentials as Record<string, unknown>,
      )
      const m = await publisher.fetchMetrics(pub.platformPostId)
      if (!m) continue // platform exposes nothing yet (IG/TikTok/TG) — skip silently

      const views = m.views ?? 0
      const likes = m.likes ?? 0
      const comments = m.comments ?? 0
      const shares = m.shares ?? 0
      const reach = m.reach ?? 0

      await prisma.publicationMetric.upsert({
        where: { publicationId_date: { publicationId: pub.id, date: today } },
        create: { publicationId: pub.id, date: today, views, likes, comments, shares, reach, raw: m as object },
        update: { views, likes, comments, shares, reach, raw: m as object },
      })

      // Keep the denormalized Publication.metrics (read by analytics.ts) in sync.
      const er = views > 0 ? (likes + comments) / views : 0
      await prisma.publication.update({
        where: { id: pub.id },
        data: { metrics: { reach, impressions: views, likes, er } as object },
      })
    } catch (err) {
      // Isolate per-publication failures (a bad token / deleted post must not stop the rest).
      console.error('[metrics] failed to record metrics for publication', pub.id, err)
    }
  }
}

export function startAnalyticsIngester(): void {
  void ingestFollowerCounts()
  setInterval(() => { void ingestFollowerCounts() }, 6 * 60 * 60 * 1000)
  void ingestPublicationMetrics()
  setInterval(() => { void ingestPublicationMetrics() }, 24 * 60 * 60 * 1000)
}
