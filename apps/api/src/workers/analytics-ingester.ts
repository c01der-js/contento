import { prisma } from '@contento/db'

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

export function startAnalyticsIngester(): void {
  void ingestFollowerCounts()
  setInterval(() => { void ingestFollowerCounts() }, 6 * 60 * 60 * 1000)
}
