# PostAnalytics — per-publication metrics + 24h poll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the metrics-collection layer the feedback loop will feed on: a new `PublicationMetric` daily-snapshot table, a `fetchMetrics(platformPostId)` method on every platform publisher, a **real** YouTube Data API metrics fetch, and a 24h poll that records per-publication metrics — while honestly returning `null` for the platforms whose metrics are app-audit-gated (Instagram, TikTok) or unavailable (Telegram Bot API hides views).

**Architecture:** `PostMetrics` (`views/likes/comments/shares/reach`) becomes part of the `PlatformPublisher` interface via `fetchMetrics(platformPostId): Promise<PostMetrics | null>`. Only **YouTube** implements a real fetch (Data API `videos.list?part=statistics`, reusing the publisher's existing `withAuthRetry` token refresh); Telegram/Instagram/TikTok/LinkedIn return `null` with a documented reason. A 24h poll (added to the existing `analytics-ingester`, which already does daily Postgres snapshots and is gated off under vitest) iterates recently-published `Publication`s, calls `createPublisher(platform, creds).fetchMetrics(platformPostId)`, upserts a `PublicationMetric` row keyed `(publicationId, date)`, and syncs the latest snapshot into the existing `Publication.metrics` JSON so the current analytics dashboard keeps working unchanged.

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), pnpm + Turborepo, Prisma (Postgres), `@contento/platforms` publisher adapters, vitest. YouTube Data API v3.

---

## Scope (read first)

User decision: **infra + YouTube-real.** Build the full metrics infrastructure AND a real YouTube fetch (the one feasible source today); the other three platforms return `null` (scaffolded with a documented reason) pending the app audits / API access the platform-strategy doc calls out.

**In scope:** `PublicationMetric` model; `PostMetrics` type + `fetchMetrics` on the publisher interface; `null` impls for TG/IG/TikTok/LinkedIn; real YouTube `fetchMetrics` + tests; 24h poll in `analytics-ingester` writing `PublicationMetric` + syncing `Publication.metrics`.

**Out of scope (later):** real IG/TikTok insights (need Business account + app review), Telegram views (Bot API hides them — would need MTProto), watch-time/retention curves, an analytics API/UI surface for the new history table (the existing `analytics.ts` dashboard keeps reading `Publication.metrics`), and the feedback loop itself (consumes this data next).

**Verified current state (from code):**
- `Publication` (schema.prisma:626): has `platformPostId String?`, `metrics Json?`, `publishedAt DateTime?`, `status PublicationStatus`, `socialAccountId`. `platformPostId` is set by the posting-service after a successful publish (`apps/posting-service/src/worker.ts`). `analytics.ts` reads `Publication.metrics` as `{ reach, impressions, likes, er }`.
- `SocialAccount` (schema.prisma:610): `platform String`, `credentials Json`. `SocialAccountSnapshot` is the existing daily-snapshot precedent (`(socialAccountId, date)` unique, upserted).
- `PlatformPublisher` (`packages/platforms/src/types.ts:13`) = `{ publish(payload): Promise<PublishResult> }` only. `PublishResult` = `{ platformPostId; url? }`. No metrics method.
- `createPublisher(platform, credentials)` (`packages/platforms/src/factory.ts`) builds the concrete publisher; YouTube creds = `{ accessToken, refreshToken, clientId, clientSecret }`.
- `YouTubePublisher` (`packages/platforms/src/youtube/publisher.ts`) has a private `withAuthRetry(fn)` wrapper that refreshes the access token on auth failure — reuse it for `fetchMetrics`.
- `apps/api/src/workers/analytics-ingester.ts`: `startAnalyticsIngester()` runs `ingestFollowerCounts()` immediately + `setInterval(6h)`. Per-account `try/catch` isolates failures. It is started in `server.ts` `onReady`, which is now gated `if (process.env['VITEST']) return`.
- **`apps/api` does NOT depend on `@contento/platforms`** — must add it.
- `PublicationMetric` model does NOT exist (confirmed).
- `packages/platforms/src/publishers.test.ts` stubs global `fetch` and tests each publisher — the home for YouTube `fetchMetrics` tests.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/prisma/schema.prisma` | modify | `PublicationMetric` model + `Publication.metricsHistory` reverse relation |
| `packages/platforms/src/types.ts` | modify | `PostMetrics` type + `fetchMetrics` on `PlatformPublisher` |
| `packages/platforms/src/telegram/publisher.ts` | modify | `fetchMetrics` → `null` (Bot API hides views) |
| `packages/platforms/src/instagram/publisher.ts` | modify | `fetchMetrics` → `null` (app-audit-gated) |
| `packages/platforms/src/tiktok/publisher.ts` | modify | `fetchMetrics` → `null` (app-audit-gated) |
| `packages/platforms/src/linkedin/publisher.ts` | modify | `fetchMetrics` → `null` |
| `packages/platforms/src/youtube/publisher.ts` | modify | real `fetchMetrics` via Data API |
| `packages/platforms/src/publishers.test.ts` | modify | YouTube `fetchMetrics` tests + a null-returning test |
| `apps/api/package.json` | modify | add `@contento/platforms` dependency |
| `apps/api/src/workers/analytics-ingester.ts` | modify | `ingestPublicationMetrics()` + 24h interval in `startAnalyticsIngester` |

---

### Task 1: Schema — `PublicationMetric` daily-snapshot model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the model.** Add near `Publication` / `SocialAccountSnapshot`:

```prisma
model PublicationMetric {
  id            String      @id @default(cuid())
  publicationId String
  date          DateTime    // day bucket (UTC midnight); one snapshot per publication per day
  views         Int         @default(0)
  likes         Int         @default(0)
  comments      Int         @default(0)
  shares        Int         @default(0)
  reach         Int         @default(0)
  raw           Json?       // raw normalized provider payload, for debugging / future fields
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  publication   Publication @relation(fields: [publicationId], references: [id], onDelete: Cascade)

  @@unique([publicationId, date])
  @@index([publicationId])
}
```

- [ ] **Step 2: Add the reverse relation.** In `model Publication`, add to the relation list (the `metrics Json?` scalar field stays — it's the denormalized "latest snapshot" the current dashboard reads):

```prisma
  metricsHistory  PublicationMetric[]
```

- [ ] **Step 3: Regenerate the client and build.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes; `prisma.publicationMetric` is typed.

(Live `db:migrate` needs Postgres — part of the deferred project-wide migration debt; the generated client suffices for typecheck/tests.)

- [ ] **Step 4: Typecheck the repo.**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): PublicationMetric daily-snapshot model for PostAnalytics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `PostMetrics` type + `fetchMetrics` on the publisher interface (+ null impls)

**Files:**
- Modify: `packages/platforms/src/types.ts`
- Modify: `packages/platforms/src/telegram/publisher.ts`
- Modify: `packages/platforms/src/instagram/publisher.ts`
- Modify: `packages/platforms/src/tiktok/publisher.ts`
- Modify: `packages/platforms/src/linkedin/publisher.ts`

- [ ] **Step 1: Add the type + interface method.** In `packages/platforms/src/types.ts`, add after `PublishResult`:

```ts
export interface PostMetrics {
  views?: number
  likes?: number
  comments?: number
  shares?: number
  reach?: number
}
```

and extend the interface:

```ts
export interface PlatformPublisher {
  publish(payload: PublishPayload): Promise<PublishResult>
  /**
   * Current metrics for a published post, or null when the platform exposes none yet:
   * Telegram Bot API hides views; Instagram/TikTok insights need a Business account +
   * app review. Only YouTube returns real data today.
   */
  fetchMetrics(platformPostId: string): Promise<PostMetrics | null>
}
```

- [ ] **Step 2: Add null `fetchMetrics` to the four non-YouTube publishers.** In each of `telegram`, `instagram`, `tiktok`, `linkedin` publisher classes, add a method (import `PostMetrics` into the type import where `PublishResult` is imported). Use the platform-appropriate reason in the comment:

Telegram:
```ts
  // Bot API does not expose per-post view counts (would require MTProto).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
```
Instagram:
```ts
  // Insights require a Business/Creator account + app review (not yet provisioned).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
```
TikTok:
```ts
  // Video Query API requires an audited app with the analytics scope (not yet provisioned).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
```
LinkedIn:
```ts
  // Organization/share statistics need additional partner permissions (not yet provisioned).
  async fetchMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    return null
  }
```

(Each publisher's type import line — e.g. `import type { PlatformPublisher, PublishPayload, PublishResult } from '../types.js'` — gains `PostMetrics`.)

- [ ] **Step 3: Typecheck.**

Run: `pnpm --filter @contento/platforms run typecheck`
Expected: FAIL — `YouTubePublisher` does not yet implement `fetchMetrics` (interface now requires it). That's expected; Task 3 implements it. To keep this task green in isolation, do Task 3 immediately after, OR add a temporary `async fetchMetrics() { return null }` to YouTube now and replace it in Task 3. (Prefer doing Task 3 next and committing them together if the isolated typecheck blocks you.)

- [ ] **Step 4: Commit** (after the YouTube impl compiles — may be combined with Task 3's commit if you implemented YouTube to satisfy the interface):

```bash
git add packages/platforms/src/types.ts packages/platforms/src/telegram/publisher.ts packages/platforms/src/instagram/publisher.ts packages/platforms/src/tiktok/publisher.ts packages/platforms/src/linkedin/publisher.ts
git commit -m "feat(platforms): PostMetrics + fetchMetrics on the publisher interface (null for TG/IG/TikTok/LinkedIn)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: YouTube — real `fetchMetrics` via the Data API

**Files:**
- Modify: `packages/platforms/src/youtube/publisher.ts`
- Modify: `packages/platforms/src/publishers.test.ts`

- [ ] **Step 1: Read `withAuthRetry` first.** Open `packages/platforms/src/youtube/publisher.ts` and read the private `withAuthRetry(fn)` wrapper (used by `publish`) to see exactly how it detects an auth failure and refreshes the token. Implement `fetchMetrics` using the SAME convention so a stale `accessToken` is refreshed identically.

- [ ] **Step 2: Write the failing tests.** In `packages/platforms/src/publishers.test.ts`, inside `describe('YouTubePublisher', ...)` (match the file's existing fetch-mock harness — it stubs global `fetch` via `fetchMock`/`mockResponse`), add:

```ts
  it('fetchMetrics returns normalized stats from the Data API', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ items: [{ statistics: { viewCount: '1500', likeCount: '42', commentCount: '7' } }] })
    )
    const publisher = new YouTubePublisher({ accessToken: 'tok', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    const m = await publisher.fetchMetrics('vid123')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/youtube/v3/videos')
    expect(url).toContain('part=statistics')
    expect(url).toContain('id=vid123')
    expect(m).toEqual({ views: 1500, likes: 42, comments: 7 })
  })

  it('fetchMetrics returns null when the video has no statistics', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ items: [] }))
    const publisher = new YouTubePublisher({ accessToken: 'tok', refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    expect(await publisher.fetchMetrics('missing')).toBeNull()
  })
```

(If the file's mock helpers are named differently, match them. The first test asserts the request shape + normalization; the second asserts the empty-result null path.)

- [ ] **Step 3: Run them, verify they fail.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t fetchMetrics`
Expected: FAIL — `fetchMetrics` not implemented (or the temporary null stub returns null for the first test).

- [ ] **Step 4: Implement.** In `YouTubePublisher`, add `PostMetrics` to the type import and implement (wrap in `withAuthRetry` to mirror `publish`'s token refresh):

```ts
  async fetchMetrics(platformPostId: string): Promise<PostMetrics | null> {
    return this.withAuthRetry(async () => {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(platformPostId)}`,
        { headers: { Authorization: `Bearer ${this.creds.accessToken}` } },
      )
      // Let withAuthRetry handle a 401 the same way publish does (refresh + retry).
      if (res.status === 401) throw new Error('youtube fetchMetrics unauthorized')
      if (!res.ok) return null
      const data = (await res.json()) as {
        items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>
      }
      const s = data.items?.[0]?.statistics
      if (!s) return null
      return {
        views: Number(s.viewCount ?? 0),
        likes: Number(s.likeCount ?? 0),
        comments: Number(s.commentCount ?? 0),
      }
    })
  }
```

> Adjust the `res.status === 401` handling to match how `withAuthRetry` actually detects an auth failure (Step 1). If `withAuthRetry` inspects a thrown error with a status property or a specific error type, throw that shape instead. The test does not hit the 401 path, so the happy path is verified regardless; keep the refresh convention consistent with `publish`.

- [ ] **Step 5: Run the YouTube tests, verify they pass.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t YouTube`
Expected: PASS (existing publish tests + the 2 new fetchMetrics tests).

- [ ] **Step 6: Full platforms typecheck + tests.**

Run: `pnpm --filter @contento/platforms run typecheck && pnpm --filter @contento/platforms exec vitest run`
Expected: PASS (interface satisfied by all 5 publishers; all tests green).

- [ ] **Step 7: Commit.**

```bash
git add packages/platforms/src/youtube/publisher.ts packages/platforms/src/publishers.test.ts
git commit -m "feat(platforms): YouTube fetchMetrics via the Data API (statistics -> PostMetrics)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 24h poll — `ingestPublicationMetrics` in the analytics ingester

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/workers/analytics-ingester.ts`

- [ ] **Step 1: Add the `@contento/platforms` dependency.** In `apps/api/package.json` `dependencies`, add:

```json
    "@contento/platforms": "workspace:*",
```

Then from the repo root: `pnpm install`.

- [ ] **Step 2: Implement the poll.** In `apps/api/src/workers/analytics-ingester.ts`, add the import and the function (mirror `ingestFollowerCounts`'s per-item try/catch isolation):

```ts
import { createPublisher } from '@contento/platforms'
```

```ts
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
    } catch {
      // Isolate per-publication failures (a bad token / deleted post must not stop the rest).
    }
  }
}
```

- [ ] **Step 3: Wire the 24h interval.** In `startAnalyticsIngester`, add the initial call + interval alongside the existing follower poll:

```ts
export function startAnalyticsIngester(): void {
  void ingestFollowerCounts()
  setInterval(() => { void ingestFollowerCounts() }, 6 * 60 * 60 * 1000)
  void ingestPublicationMetrics()
  setInterval(() => { void ingestPublicationMetrics() }, 24 * 60 * 60 * 1000)
}
```

(`startAnalyticsIngester` is called from `server.ts` `onReady`, which is gated `if (process.env['VITEST']) return` — so the poll never runs in unit tests.)

- [ ] **Step 4: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck`
Expected: PASS (`prisma.publicationMetric` typed; `createPublisher` resolved from the new dep).

- [ ] **Step 5: Run the api tests (must still exit 0).**

Run: `pnpm --filter @contento/api run test`
Expected: PASS, exit 0 (the poll is gated off under vitest; the existing 13 tests still pass).

- [ ] **Step 6: Commit.**

```bash
git add apps/api/package.json apps/api/src/workers/analytics-ingester.ts pnpm-lock.yaml
git commit -m "feat(api): 24h poll records PublicationMetric snapshots and syncs Publication.metrics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full verification

- [ ] **Step 1: Repo-wide typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test`
Expected: typecheck 21/21; tests green (platforms publishers incl. YouTube fetchMetrics; api 13/13 exit 0).

- [ ] **Step 2: Trace the data path by reading.** Confirm: posting-service sets `Publication.platformPostId` on publish → `ingestPublicationMetrics` (24h, gated off in tests) loads PUBLISHED pubs with a `platformPostId` from the last 30 days → `createPublisher(platform, creds).fetchMetrics(postId)` returns real data for YouTube / `null` for the others → upsert `PublicationMetric (publicationId, date)` + sync `Publication.metrics { reach, impressions, likes, er }` → existing `analytics.ts` dashboard reads the synced field unchanged. Note any gap as a follow-up.

---

## Out of scope (later, as follow-ups)
- **Real IG/TikTok insights** (Business account + app review) and **Telegram views** (MTProto) — currently `null`.
- **An analytics API/UI over `PublicationMetric` history** (growth curves, per-day deltas) — the existing dashboard keeps reading `Publication.metrics`; the history table is built for the feedback loop, not yet surfaced.
- **The feedback loop** — consumes `PublicationMetric` to weight golden examples into idea/script generation (next wedge step; needs ~20 published videos for signal).
- **Watch-time / retention / impressions-source breakdowns** — `PostMetrics` is intentionally minimal.
- **A BullMQ queue for the poll** — reused the existing `analytics-ingester` setInterval pattern instead of introducing a parallel mechanism for the same concern.

## Risks / decisions surfaced
- **Only YouTube returns real data today.** This is the platform-strategy reality (IG/TikTok app-audit-gated; TG hides views). The infra + history table are built so the feedback loop can start on YouTube data and light up the rest when audits land. The `null` returns are explicit and commented per platform.
- **Adding `fetchMetrics` to the interface** forces all 5 publishers to implement it — done (4 null + YouTube real). No other `PlatformPublisher` implementors exist.
- **Dual-write `Publication.metrics`** keeps the current `analytics.ts` dashboard working without changes while `PublicationMetric` accumulates history. The `er` mapping (`(likes+comments)/views`) approximates the dashboard's engagement-rate field.
- **The poll runs in the api process** via `setInterval` (consistent with the existing follower ingester), gated off under vitest. At deploy scale this should move to a dedicated worker / BullMQ repeatable job — noted for the deploy phase.
- **YouTube token refresh**: `fetchMetrics` reuses `withAuthRetry`; the exact 401-detection must match the publish path (Task 3 Step 1/4).
- **Migration debt**: Task 1 adds the model via the generated client; the SQL migration is part of the deferred project-wide migration debt.
