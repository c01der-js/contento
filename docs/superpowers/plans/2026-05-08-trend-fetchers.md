# Trend Fetchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `trend-fetcher` service that periodically pulls trending content from RSS, Reddit, Google Trends, and YouTube, then publishes `TrendDiscovered` Kafka events for the existing `trend-analyzer` worker to process.

**Architecture:** New BullMQ app (`apps/trend-fetcher`) uses a repeatable job (every 30 min) to read **global** `TrendFeedConfig` records (no per-workspace config needed), dispatch the right fetcher for each source, then broadcast each discovered trend to **all active workspaces** as separate `TrendDiscovered` Kafka events. The existing `trend-analyzer` worker picks those events up unchanged — each workspace gets its own relevance-scored copy of the trend.

**Tech Stack:** BullMQ 5, ioredis, rss-parser, google-trends-api, vitest (mocks for all external calls), Prisma, KafkaJS via `@contento/shared`

---

## File Map

**Modified:**
- `packages/db/prisma/schema.prisma` — add global `TrendFeedConfig` model (no `workspaceId` — system-level configs)

**Created:**
- `apps/trend-fetcher/package.json`
- `apps/trend-fetcher/tsconfig.json`
- `apps/trend-fetcher/vitest.config.ts`
- `apps/trend-fetcher/src/fetchers/types.ts` — `FetchedTrend` + per-source config types
- `apps/trend-fetcher/src/fetchers/rss.ts`
- `apps/trend-fetcher/src/fetchers/reddit.ts`
- `apps/trend-fetcher/src/fetchers/google-trends.ts`
- `apps/trend-fetcher/src/fetchers/youtube.ts`
- `apps/trend-fetcher/src/__tests__/rss.test.ts`
- `apps/trend-fetcher/src/__tests__/reddit.test.ts`
- `apps/trend-fetcher/src/__tests__/google-trends.test.ts`
- `apps/trend-fetcher/src/__tests__/youtube.test.ts`
- `apps/trend-fetcher/src/publisher.ts` — creates DB record first, then publishes Kafka event (gives Prisma-generated cuid to satisfy `TrendDiscoveredSchema`)
- `apps/trend-fetcher/src/__tests__/publisher.test.ts`
- `apps/trend-fetcher/src/worker.ts` — BullMQ repeatable job orchestrator
- `apps/trend-fetcher/src/index.ts` — entry point + graceful shutdown

**Modified:**
- `infra/docker-compose.yml` — add trend-fetcher service
- `infra/.env.example` — add `YOUTUBE_API_KEY`

---

## Task 1: Add TrendFeedConfig to DB

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add TrendFeedConfig model**

Insert after the `Trend` model (after line 270 — after the closing `}` and `@@index` lines of `Trend`).

This model is **global** — no `workspaceId`. One set of feeds for the whole system. Admins seed configs directly in DB; no workspace-level configuration needed.

```prisma
model TrendFeedConfig {
  id        String   @id @default(cuid())
  source    String   // rss | reddit | google_trends | youtube
  config    Json     // source-specific config object
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([enabled])
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter @contento/db exec prisma migrate dev --name add_trend_feed_config
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add global TrendFeedConfig model for system-level trend source config"
```

---

## Task 2: Create apps/trend-fetcher skeleton

**Files:**
- Create: `apps/trend-fetcher/package.json`
- Create: `apps/trend-fetcher/tsconfig.json`
- Create: `apps/trend-fetcher/vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@contento/trend-fetcher",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc --build",
    "dev": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  },
  "dependencies": {
    "@contento/db": "workspace:*",
    "@contento/shared": "workspace:*",
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "rss-parser": "^3.13.0",
    "google-trends-api": "^4.9.2"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "paths": {}
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/db" },
    { "path": "../../packages/shared" }
  ]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 4: Install deps**

```bash
pnpm install
```

Expected: No errors. `rss-parser` and `google-trends-api` appear in lockfile.

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/
git commit -m "feat(trend-fetcher): scaffold app"
```

---

## Task 3: Fetcher types

**Files:**
- Create: `apps/trend-fetcher/src/fetchers/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export interface FetchedTrend {
  title: string
  url?: string
  description?: string
}

export interface RssConfig {
  url: string
}

export interface RedditConfig {
  subreddit: string
  limit?: number
}

export interface GoogleTrendsConfig {
  geo?: string
}

export interface YouTubeConfig {
  query: string
  maxResults?: number
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/trend-fetcher/src/fetchers/types.ts
git commit -m "feat(trend-fetcher): fetcher types"
```

---

## Task 4: RSS fetcher

**Files:**
- Create: `apps/trend-fetcher/src/fetchers/rss.ts`
- Create: `apps/trend-fetcher/src/__tests__/rss.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/trend-fetcher/src/__tests__/rss.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchRss } from '../fetchers/rss.js'

vi.mock('rss-parser', () => {
  const Parser = vi.fn()
  Parser.prototype.parseURL = vi.fn()
  return { default: Parser }
})

describe('fetchRss', () => {
  let parseURL: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { default: Parser } = await import('rss-parser')
    parseURL = (Parser as any).prototype.parseURL
    parseURL.mockResolvedValue({
      items: [
        { title: 'Trend One', link: 'https://example.com/1', contentSnippet: 'Desc one' },
        { title: 'Trend Two', link: 'https://example.com/2' },
        { title: undefined, link: 'https://example.com/3' }, // no title — skip
      ],
    })
  })

  it('returns FetchedTrend list from feed items', async () => {
    const results = await fetchRss({ url: 'https://feeds.example.com/rss' })
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Trend One', url: 'https://example.com/1', description: 'Desc one' })
    expect(results[1]).toEqual({ title: 'Trend Two', url: 'https://example.com/2' })
  })

  it('returns empty array on fetch error', async () => {
    parseURL.mockRejectedValue(new Error('Network error'))
    const results = await fetchRss({ url: 'https://bad-url.example.com' })
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @contento/trend-fetcher test
```

Expected: FAIL — `fetchRss` not found.

- [ ] **Step 3: Implement rss.ts**

```typescript
// apps/trend-fetcher/src/fetchers/rss.ts
import Parser from 'rss-parser'
import type { FetchedTrend, RssConfig } from './types.js'

const parser = new Parser()

export async function fetchRss(config: RssConfig): Promise<FetchedTrend[]> {
  try {
    const feed = await parser.parseURL(config.url)
    return feed.items
      .filter((item) => Boolean(item.title))
      .map((item) => ({
        title: item.title!,
        url: item.link,
        ...(item.contentSnippet ? { description: item.contentSnippet } : {}),
      }))
  } catch (err) {
    console.error('[trend-fetcher/rss] Error fetching %s: %o', config.url, err)
    return []
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/src/fetchers/rss.ts apps/trend-fetcher/src/__tests__/rss.test.ts
git commit -m "feat(trend-fetcher): RSS fetcher"
```

---

## Task 5: Reddit fetcher

**Files:**
- Create: `apps/trend-fetcher/src/fetchers/reddit.ts`
- Create: `apps/trend-fetcher/src/__tests__/reddit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/trend-fetcher/src/__tests__/reddit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchReddit } from '../fetchers/reddit.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('fetchReddit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          children: [
            { data: { title: 'Hot Post One', url: 'https://reddit.com/r/tech/1', selftext: 'Summary one' } },
            { data: { title: 'Hot Post Two', url: 'https://reddit.com/r/tech/2', selftext: '' } },
            { data: { title: '', url: 'https://reddit.com/3', selftext: '' } }, // no title — skip
          ],
        },
      }),
    })
  })

  it('returns top posts from subreddit', async () => {
    const results = await fetchReddit({ subreddit: 'technology', limit: 10 })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.reddit.com/r/technology/hot.json?limit=10',
      expect.objectContaining({ headers: expect.any(Object) })
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Hot Post One', url: 'https://reddit.com/r/tech/1', description: 'Summary one' })
    expect(results[1]).toEqual({ title: 'Hot Post Two', url: 'https://reddit.com/r/tech/2' })
  })

  it('uses default limit of 25', async () => {
    await fetchReddit({ subreddit: 'technology' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.reddit.com/r/technology/hot.json?limit=25',
      expect.any(Object)
    )
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await fetchReddit({ subreddit: 'technology' })).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    expect(await fetchReddit({ subreddit: 'technology' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 3: Implement reddit.ts**

```typescript
// apps/trend-fetcher/src/fetchers/reddit.ts
import type { FetchedTrend, RedditConfig } from './types.js'

interface RedditPost {
  data: { title: string; url: string; selftext?: string }
}

interface RedditResponse {
  data: { children: RedditPost[] }
}

export async function fetchReddit(config: RedditConfig): Promise<FetchedTrend[]> {
  const limit = config.limit ?? 25
  const url = `https://www.reddit.com/r/${config.subreddit}/hot.json?limit=${limit}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'trend-fetcher/1.0' } })
    if (!res.ok) {
      console.error('[trend-fetcher/reddit] HTTP %d for r/%s', res.status, config.subreddit)
      return []
    }
    const data = (await res.json()) as RedditResponse
    return data.data.children
      .filter((c) => Boolean(c.data.title))
      .map((c) => ({
        title: c.data.title,
        url: c.data.url,
        ...(c.data.selftext ? { description: c.data.selftext } : {}),
      }))
  } catch (err) {
    console.error('[trend-fetcher/reddit] Error for r/%s: %o', config.subreddit, err)
    return []
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/src/fetchers/reddit.ts apps/trend-fetcher/src/__tests__/reddit.test.ts
git commit -m "feat(trend-fetcher): Reddit fetcher"
```

---

## Task 6: Google Trends fetcher

**Files:**
- Create: `apps/trend-fetcher/src/fetchers/google-trends.ts`
- Create: `apps/trend-fetcher/src/__tests__/google-trends.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/trend-fetcher/src/__tests__/google-trends.test.ts
import { describe, it, expect, vi } from 'vitest'
import { fetchGoogleTrends } from '../fetchers/google-trends.js'

vi.mock('google-trends-api', () => ({
  default: { dailyTrends: vi.fn() },
}))

describe('fetchGoogleTrends', () => {
  it('returns trending topics', async () => {
    const { default: googleTrends } = await import('google-trends-api')
    vi.mocked(googleTrends.dailyTrends).mockResolvedValue(
      JSON.stringify({
        default: {
          trendingSearchesDays: [{
            trendingSearches: [
              { title: { query: 'AI breakthrough' }, articles: [{ url: 'https://news.example.com/ai' }] },
              { title: { query: 'Climate news' }, articles: [] },
            ],
          }],
        },
      })
    )

    const results = await fetchGoogleTrends({ geo: 'US' })
    expect(vi.mocked(googleTrends.dailyTrends)).toHaveBeenCalledWith({ geo: 'US' })
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'AI breakthrough', url: 'https://news.example.com/ai' })
    expect(results[1]).toEqual({ title: 'Climate news' })
  })

  it('returns empty array on API error', async () => {
    const { default: googleTrends } = await import('google-trends-api')
    vi.mocked(googleTrends.dailyTrends).mockRejectedValue(new Error('API error'))
    expect(await fetchGoogleTrends({ geo: 'US' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 3: Implement google-trends.ts**

```typescript
// apps/trend-fetcher/src/fetchers/google-trends.ts
import googleTrends from 'google-trends-api'
import type { FetchedTrend, GoogleTrendsConfig } from './types.js'

interface TrendingSearch {
  title: { query: string }
  articles: { url: string }[]
}

interface DailyTrendsResponse {
  default: {
    trendingSearchesDays: { trendingSearches: TrendingSearch[] }[]
  }
}

export async function fetchGoogleTrends(config: GoogleTrendsConfig): Promise<FetchedTrend[]> {
  try {
    const raw = await googleTrends.dailyTrends({ geo: config.geo ?? 'US' })
    const data: DailyTrendsResponse = JSON.parse(raw as string)
    const searches = data.default.trendingSearchesDays[0]?.trendingSearches ?? []
    return searches.map((s) => ({
      title: s.title.query,
      ...(s.articles[0]?.url ? { url: s.articles[0].url } : {}),
    }))
  } catch (err) {
    console.error('[trend-fetcher/google-trends] Error: %o', err)
    return []
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/src/fetchers/google-trends.ts apps/trend-fetcher/src/__tests__/google-trends.test.ts
git commit -m "feat(trend-fetcher): Google Trends fetcher"
```

---

## Task 7: YouTube fetcher

**Files:**
- Create: `apps/trend-fetcher/src/fetchers/youtube.ts`
- Create: `apps/trend-fetcher/src/__tests__/youtube.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/trend-fetcher/src/__tests__/youtube.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchYouTube } from '../fetchers/youtube.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('fetchYouTube', () => {
  const originalKey = process.env.YOUTUBE_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.YOUTUBE_API_KEY = 'test-api-key'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { snippet: { title: 'Video One', description: 'Desc one' }, id: { videoId: 'abc123' } },
          { snippet: { title: 'Video Two', description: '' }, id: { videoId: 'def456' } },
        ],
      }),
    })
  })

  afterEach(() => {
    process.env.YOUTUBE_API_KEY = originalKey
  })

  it('returns search results as FetchedTrend list', async () => {
    const results = await fetchYouTube({ query: 'AI trends', maxResults: 5 })
    const calledUrl = new URL(mockFetch.mock.calls[0][0] as string)
    expect(calledUrl.hostname).toBe('www.googleapis.com')
    expect(calledUrl.searchParams.get('q')).toBe('AI trends')
    expect(calledUrl.searchParams.get('maxResults')).toBe('5')
    expect(calledUrl.searchParams.get('key')).toBe('test-api-key')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ title: 'Video One', url: 'https://www.youtube.com/watch?v=abc123', description: 'Desc one' })
    expect(results[1]).toEqual({ title: 'Video Two', url: 'https://www.youtube.com/watch?v=def456' })
  })

  it('returns empty array when YOUTUBE_API_KEY is not set', async () => {
    delete process.env.YOUTUBE_API_KEY
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
  })

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    expect(await fetchYouTube({ query: 'AI trends' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 3: Implement youtube.ts**

```typescript
// apps/trend-fetcher/src/fetchers/youtube.ts
import type { FetchedTrend, YouTubeConfig } from './types.js'

interface YouTubeItem {
  snippet: { title: string; description: string }
  id: { videoId: string }
}

interface YouTubeResponse {
  items: YouTubeItem[]
}

export async function fetchYouTube(config: YouTubeConfig): Promise<FetchedTrend[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    console.warn('[trend-fetcher/youtube] YOUTUBE_API_KEY not set, skipping')
    return []
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', config.query)
  url.searchParams.set('type', 'video')
  url.searchParams.set('order', 'viewCount')
  url.searchParams.set('maxResults', String(config.maxResults ?? 10))
  url.searchParams.set('key', apiKey)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.error('[trend-fetcher/youtube] HTTP %d for query "%s"', res.status, config.query)
      return []
    }
    const data = (await res.json()) as YouTubeResponse
    return data.items.map((item) => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      ...(item.snippet.description ? { description: item.snippet.description } : {}),
    }))
  } catch (err) {
    console.error('[trend-fetcher/youtube] Error for query "%s": %o', config.query, err)
    return []
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/src/fetchers/youtube.ts apps/trend-fetcher/src/__tests__/youtube.test.ts
git commit -m "feat(trend-fetcher): YouTube fetcher"
```

---

## Task 8: Publisher

**Files:**
- Create: `apps/trend-fetcher/src/publisher.ts`
- Create: `apps/trend-fetcher/src/__tests__/publisher.test.ts`

**Key design:** Trends are **global** — publisher fetches all active workspace IDs, then for each workspace creates a `Trend` DB record (Prisma generates valid cuid used in Kafka event) and publishes a `TrendDiscovered` event. 24h URL dedup per workspace prevents duplicate events. Each workspace gets its own copy so `trend-analyzer` scores relevance independently.

- [ ] **Step 1: Write failing test**

```typescript
// apps/trend-fetcher/src/__tests__/publisher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FetchedTrend } from '../fetchers/types.js'

const mockCreate = vi.fn()
const mockFindFirst = vi.fn()
const mockFindManyWorkspaces = vi.fn()
vi.mock('@contento/db', () => ({
  prisma: {
    trend: { create: mockCreate, findFirst: mockFindFirst },
    workspace: { findMany: mockFindManyWorkspaces },
  },
}))

const mockSend = vi.fn()
vi.mock('@contento/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contento/shared')>()
  return {
    ...actual,
    createKafkaClient: vi.fn().mockReturnValue({}),
    TypedProducer: vi.fn().mockImplementation(() => ({ send: mockSend, disconnect: vi.fn() })),
  }
})

describe('broadcastTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindManyWorkspaces.mockResolvedValue([{ id: 'ws-aaa' }, { id: 'ws-bbb' }])
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'cltest123abc456' })
  })

  it('broadcasts each trend to all workspaces', async () => {
    const { broadcastTrends } = await import('../publisher.js')
    const trends: FetchedTrend[] = [
      { title: 'Trend A', url: 'https://example.com/a' },
    ]
    await broadcastTrends('rss', trends)

    // 2 workspaces × 1 trend = 2 DB creates + 2 Kafka events
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(
      'trends',
      expect.objectContaining({ workspaceId: 'ws-aaa', title: 'Trend A', source: 'rss' })
    )
    expect(mockSend).toHaveBeenCalledWith(
      'trends',
      expect.objectContaining({ workspaceId: 'ws-bbb', title: 'Trend A', source: 'rss' })
    )
  })

  it('skips workspace where URL was already seen in last 24h', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: 'existing' }) // ws-aaa: dup
      .mockResolvedValueOnce(null)               // ws-bbb: new
    const { broadcastTrends } = await import('../publisher.js')
    await broadcastTrends('rss', [{ title: 'Dup', url: 'https://example.com/dup' }])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith('trends', expect.objectContaining({ workspaceId: 'ws-bbb' }))
  })

  it('skips dedup check for trends without URL', async () => {
    const { broadcastTrends } = await import('../publisher.js')
    await broadcastTrends('google_trends', [{ title: 'No URL trend' }])
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledTimes(2) // both workspaces
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 3: Implement publisher.ts**

```typescript
// apps/trend-fetcher/src/publisher.ts
import { prisma } from '@contento/db'
import { TypedProducer, createKafkaClient, TOPIC_TRENDS } from '@contento/shared'
import type { FetchedTrend } from './fetchers/types.js'

const kafka = createKafkaClient({ clientId: 'trend-fetcher' })
let _producer: TypedProducer | null = null

function getProducer(): TypedProducer {
  if (!_producer) _producer = new TypedProducer(kafka)
  return _producer
}

export function getKafkaProducer(): TypedProducer {
  return getProducer()
}

export async function broadcastTrends(
  source: string,
  trends: FetchedTrend[],
): Promise<void> {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  for (const { id: workspaceId } of workspaces) {
    for (const trend of trends) {
      if (trend.url) {
        const existing = await prisma.trend.findFirst({
          where: { workspaceId, url: trend.url, discoveredAt: { gte: cutoff } },
          select: { id: true },
        })
        if (existing) continue
      }

      const record = await prisma.trend.create({
        data: {
          workspaceId,
          title: trend.title,
          ...(trend.url ? { url: trend.url } : {}),
          source,
          status: 'PENDING',
          discoveredAt: new Date(),
        },
        select: { id: true },
      })

      await getProducer().send(TOPIC_TRENDS, {
        eventId: crypto.randomUUID(),
        workspaceId,
        timestamp: new Date().toISOString(),
        trendId: record.id,
        title: trend.title,
        ...(trend.url ? { url: trend.url } : {}),
        source,
      })
    }
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @contento/trend-fetcher test
```

- [ ] **Step 5: Commit**

```bash
git add apps/trend-fetcher/src/publisher.ts apps/trend-fetcher/src/__tests__/publisher.test.ts
git commit -m "feat(trend-fetcher): Kafka publisher with 24h deduplication"
```

---

## Task 9: BullMQ worker

**Files:**
- Create: `apps/trend-fetcher/src/worker.ts`

- [ ] **Step 1: Implement worker.ts**

```typescript
// apps/trend-fetcher/src/worker.ts
import { Queue, Worker } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { fetchRss } from './fetchers/rss.js'
import { fetchReddit } from './fetchers/reddit.js'
import { fetchGoogleTrends } from './fetchers/google-trends.js'
import { fetchYouTube } from './fetchers/youtube.js'
import { broadcastTrends } from './publisher.js'
import type { RssConfig, RedditConfig, GoogleTrendsConfig, YouTubeConfig } from './fetchers/types.js'

const QUEUE_NAME = 'trend-fetch'
const REPEAT_EVERY_MS = 30 * 60 * 1000
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let _redis: IORedis | null = null
function getRedis() {
  if (!_redis) _redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  return _redis
}

export const queue = new Queue(QUEUE_NAME, { connection: getRedis() })

export async function scheduleRepeatableJob(): Promise<void> {
  await queue.upsertJobScheduler(
    'fetch-all-trends',
    { every: REPEAT_EVERY_MS },
    { name: 'fetch-all-trends', data: {} },
  )
}

export function createWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const configs = await prisma.trendFeedConfig.findMany({
        where: { enabled: true },
        select: { source: true, config: true },
      })

      for (const { source, config } of configs) {
        try {
          switch (source) {
            case 'rss': {
              const trends = await fetchRss(config as unknown as RssConfig)
              await broadcastTrends(source, trends)
              break
            }
            case 'reddit': {
              const trends = await fetchReddit(config as unknown as RedditConfig)
              await broadcastTrends(source, trends)
              break
            }
            case 'google_trends': {
              const trends = await fetchGoogleTrends(config as unknown as GoogleTrendsConfig)
              await broadcastTrends(source, trends)
              break
            }
            case 'youtube': {
              const trends = await fetchYouTube(config as unknown as YouTubeConfig)
              await broadcastTrends(source, trends)
              break
            }
            default:
              console.warn('[trend-fetcher] Unknown source: %s', source)
          }
        } catch (err) {
          console.error('[trend-fetcher] Failed config source=%s: %o', source, err)
        }
      }
    },
    { connection: getRedis() },
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/trend-fetcher/src/worker.ts
git commit -m "feat(trend-fetcher): BullMQ worker with 30-min repeatable job"
```

---

## Task 10: Entry point + infra

**Files:**
- Create: `apps/trend-fetcher/src/index.ts`
- Modify: `infra/docker-compose.yml`
- Modify: `infra/.env.example`

- [ ] **Step 1: Create index.ts**

```typescript
// apps/trend-fetcher/src/index.ts
import { prisma } from '@contento/db'
import { scheduleRepeatableJob, createWorker, queue } from './worker.js'
import { getKafkaProducer } from './publisher.js'

async function main() {
  console.log('[trend-fetcher] Starting...')
  await scheduleRepeatableJob()
  const worker = createWorker()

  async function shutdown() {
    await worker.close()
    await queue.close()
    try { await getKafkaProducer().disconnect() } catch {}
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => { void shutdown() })
  process.on('SIGINT', () => { void shutdown() })

  console.log('[trend-fetcher] Running. Fetches every 30 minutes.')
}

main().catch((err) => {
  console.error('[trend-fetcher] Fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Add YOUTUBE_API_KEY to infra/.env.example**

Add at end of `infra/.env.example`:

```
YOUTUBE_API_KEY=        # YouTube Data API v3 key — YouTube fetcher silently skips if unset
```

- [ ] **Step 3: Add trend-fetcher service to docker-compose.yml**

After the `trend-analyzer` service block in `infra/docker-compose.yml`, add:

```yaml
  trend-fetcher:
    build:
      context: ..
      dockerfile: apps/trend-fetcher/Dockerfile
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - KAFKA_BROKERS=kafka:9092
      - DATABASE_URL=${DATABASE_URL}
      - YOUTUBE_API_KEY=${YOUTUBE_API_KEY}
    depends_on:
      - redis
      - kafka
      - postgres
    restart: unless-stopped
```

Note: `apps/trend-fetcher/Dockerfile` mirrors the pattern from `apps/trend-analyzer/Dockerfile` — copy that file and replace `trend-analyzer` with `trend-fetcher`.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @contento/trend-fetcher exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm --filter @contento/trend-fetcher test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/trend-fetcher/src/index.ts infra/docker-compose.yml infra/.env.example
git commit -m "feat(trend-fetcher): entry point + infra wiring"
```

---

## Self-Review

### Spec coverage
- RSS fetcher ✓ (Task 4)
- Reddit fetcher ✓ (Task 5)
- Google Trends fetcher ✓ (Task 6)
- YouTube fetcher ✓ (Task 7)
- Global `TrendFeedConfig` model (no per-workspace setup needed) ✓ (Task 1)
- BullMQ repeatable scheduling every 30 min ✓ (Task 9)
- Broadcast to all workspaces — single fetch, all users get the trend ✓ (Task 8)
- Kafka publishing via existing `trend-analyzer` pipeline ✓ (Task 8)
- 24h URL deduplication per workspace ✓ (Task 8)
- Graceful shutdown ✓ (Task 10)
- YOUTUBE_API_KEY optional — silent skip if unset ✓ (Task 7)

### Type consistency
- `FetchedTrend`, `RssConfig`, `RedditConfig`, `GoogleTrendsConfig`, `YouTubeConfig` defined Task 3, used Tasks 4–9 ✓
- `broadcastTrends(source: string, trends: FetchedTrend[])` defined Task 8, called Task 9 ✓
- `getKafkaProducer()` defined Task 8, called Task 10 ✓
- `prisma.trendFeedConfig` (no workspaceId) available after Task 1 migration ✓
- `prisma.workspace.findMany` used in publisher to get all workspace IDs ✓
- `TOPIC_TRENDS` from `@contento/shared` used in publisher ✓
