# P0: Wire Generated Video Through to Publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI-generated 9:16 video actually reach the social platforms: link `VideoJob.outputUrl` to `Publication`, carry it through the publish payload (presigned so platforms can fetch it), teach the RU-priority publishers (VK, Telegram, Instagram Reels) + TikTok/YouTube to post video, and fix the silently-broken scheduled-publish path. Plus introduce a `VideoProvider` abstraction so the lipsync engine can be swapped later.

**Architecture:** Today the publish payload only carries `imageUrl` sourced from a PNG `RenderJob`; the generated MP4 (`VideoJob.outputUrl`) is never linked to a `Publication`, and the scheduler drops `platform` from its BullMQ job so the Kafka event fails validation and is silently discarded. This plan adds an explicit `Publication.videoJobId` FK, a `PublishPayload.videoUrl` field, presigning of the private S3 URL in the posting-service, per-platform video publish flows, and routes the video worker through a `VideoProvider` interface (HiggsfieldProvider the only impl for now).

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), pnpm + Turborepo, vitest, Prisma (Postgres), BullMQ/Redis, Kafka (`@contento/shared` typed producer/consumer), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

**Verified facts (from code + 2026 platform docs):**
- Scheduler bug: `apps/scheduler/src/worker.ts` `syncScheduledJobs` enqueues `{publicationId, workspaceId, socialAccountId}` (no `platform`); the worker reads `platform` → `undefined` → `PublishRequestedSchema.parse` throws in posting-service → caught + acked → event lost.
- `Publication` (schema.prisma:619) has `renderJobId String?` but NO `videoJobId`. `ContentPlanItem.videoJobId` exists (schema.prisma:1023) and is set by the campaign producer.
- `PublishPayload` (`packages/platforms/src/types.ts`) = `{ text; imageUrl?; hashtags? }`. Posting-service builds it from `publication.renderJob?.outputUrl` (a PNG).
- Telegram `sendVideo`, VK `video.save`+upload+`wall.post`, Instagram `media_type=REELS` (async, poll `status_code`) all accept/produce video. TikTok/YouTube already accept a video URL but read `payload.imageUrl`.
- Private MinIO/S3 URL must be presigned for platforms to fetch (same pattern as `apps/video-worker/src/s3-client.ts:presignGetUrl`).
- `'x'` is in `SocialPlatformSchema` but has no publisher → `createPublisher('x')` throws.
- Tests: `packages/platforms` has vitest + `src/publishers.test.ts` (stubs global `fetch`). `apps/scheduler` and `apps/posting-service` have `vitest.config.ts` but no `test` npm script yet.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/scheduler/src/worker.ts` | modify | include `platform` in the scheduled BullMQ job |
| `apps/scheduler/package.json` | modify | add `"test": "vitest run"` |
| `apps/scheduler/src/worker.test.ts` | create | assert job data carries `platform` |
| `packages/platforms/src/types.ts` | modify | add `videoUrl?: string` to `PublishPayload` |
| `packages/shared/src/types.ts` | modify | drop `'x'` from `SocialPlatformSchema` |
| `packages/db/prisma/schema.prisma` | modify | `Publication.videoJobId` FK + `VideoJob.publications` |
| `packages/platforms/src/telegram/publisher.ts` | modify | `sendVideo` when `videoUrl` |
| `packages/platforms/src/vk/publisher.ts` | modify | `video.save`→upload→`wall.post` when `videoUrl` |
| `packages/platforms/src/instagram/publisher.ts` | modify | REELS async flow when `videoUrl` |
| `packages/platforms/src/tiktok/publisher.ts` | modify | prefer `videoUrl` |
| `packages/platforms/src/youtube/publisher.ts` | modify | prefer `videoUrl` |
| `packages/platforms/src/publishers.test.ts` | modify | add video-branch tests |
| `apps/posting-service/src/s3.ts` | create | presign helper for the private bucket |
| `apps/posting-service/package.json` | modify | add aws-sdk s3 deps |
| `apps/posting-service/src/worker.ts` | modify | include `videoJob`, presign, build payload with `videoUrl` |
| `apps/api/src/routes/campaigns.ts` | modify | set `videoJobId` on `Publication` in approve handler |
| `packages/ai/src/video-provider.ts` | create | `VideoProvider` interface + `createVideoProvider` |
| `packages/ai/src/higgsfield/provider.ts` | create | `HiggsfieldProvider` impl |
| `packages/ai/src/index.ts` | modify | export provider |
| `packages/ai/src/video/higgsfield.ts` | delete | dead duplicate client |
| `apps/video-worker/src/worker.ts` | modify | route shot generation through `VideoProvider` |

---

### Task 1: Fix the silently-dropped scheduled publish (`platform` missing)

**Files:**
- Modify: `apps/scheduler/src/worker.ts`
- Modify: `apps/scheduler/package.json`
- Create: `apps/scheduler/src/worker.test.ts`

- [ ] **Step 1: Add a `test` script.** In `apps/scheduler/package.json` `scripts`, add (next to `build`):

```json
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing test.** Create `apps/scheduler/src/worker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAdd = vi.fn()
const mockFindMany = vi.fn()
const mockAccountFindMany = vi.fn()

vi.mock('bullmq', () => ({
  Queue: class {
    add = mockAdd
  },
  Worker: class {},
}))
vi.mock('ioredis', () => ({ Redis: class {} }))
vi.mock('@contento/shared', () => ({
  createKafkaClient: () => ({}),
  TypedProducer: class {
    send = vi.fn()
  },
  TOPIC_PUBLISH: 'publish',
}))
vi.mock('@contento/db', () => ({
  prisma: {
    publication: { findMany: mockFindMany },
    socialAccount: { findMany: mockAccountFindMany },
  },
}))

import { syncScheduledJobs } from './worker.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncScheduledJobs', () => {
  it('includes platform in the enqueued job data', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'pub1', workspaceId: 'ws1', socialAccountId: 'acc1', scheduledAt: new Date('2099-01-01T00:00:00Z') },
    ])
    mockAccountFindMany.mockResolvedValue([{ id: 'acc1', platform: 'telegram' }])

    await syncScheduledJobs()

    expect(mockAdd).toHaveBeenCalledTimes(1)
    const [, data] = mockAdd.mock.calls[0] as [string, Record<string, unknown>]
    expect(data.platform).toBe('telegram')
    expect(data.publicationId).toBe('pub1')
  })
})
```

- [ ] **Step 3: Run it, verify it fails.**

Run: `pnpm --filter @contento/scheduler exec vitest run src/worker.test.ts`
Expected: FAIL — `data.platform` is `undefined` (current code omits it).

- [ ] **Step 4: Fix the worker.** In `apps/scheduler/src/worker.ts`, inside `syncScheduledJobs`, change the `queue.add` call to include `platform`:

```ts
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
```

- [ ] **Step 5: Run the test, verify it passes.**

Run: `pnpm --filter @contento/scheduler exec vitest run src/worker.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm --filter @contento/scheduler run typecheck`
Expected: PASS.

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add apps/scheduler/src/worker.ts apps/scheduler/src/worker.test.ts apps/scheduler/package.json
git commit -m "fix(scheduler): include platform in scheduled publish job so the Kafka event validates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Add `PublishPayload.videoUrl` and drop the publisher-less `'x'` platform

**Files:**
- Modify: `packages/platforms/src/types.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add `videoUrl` to the payload.** In `packages/platforms/src/types.ts`, extend the interface:

```ts
export interface PublishPayload {
  text: string          // caption/message text
  imageUrl?: string     // URL of the rendered image (PNG)
  videoUrl?: string     // URL of the rendered video (MP4); preferred over imageUrl when set
  hashtags?: string[]   // optional, append to text if platform doesn't handle separately
}
```

- [ ] **Step 2: Remove `'x'`** (no publisher exists; `createPublisher('x')` throws). In `packages/shared/src/types.ts`:

```ts
export const SocialPlatformSchema = z.enum([
  'telegram', 'instagram', 'tiktok', 'youtube', 'linkedin', 'vk',
])
```

- [ ] **Step 3: Typecheck both packages.**

Run: `pnpm --filter @contento/platforms run typecheck && pnpm --filter @contento/shared run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add packages/platforms/src/types.ts packages/shared/src/types.ts
git commit -m "feat(platforms): add PublishPayload.videoUrl; drop publisher-less 'x' platform

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Link `VideoJob` to `Publication` in the schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the FK to `Publication`.** In `model Publication` (schema.prisma:619), add the field after `renderJobId` and the relation after the `renderJob` relation:

Field (after `renderJobId String?`):
```prisma
  videoJobId      String?
```
Relation (after the `renderJob RenderJob? @relation(...)` line):
```prisma
  videoJob        VideoJob?         @relation(fields: [videoJobId], references: [id], onDelete: SetNull)
```
Index (inside the `@@index` block at the end of the model):
```prisma
  @@index([videoJobId])
```

- [ ] **Step 2: Add the reverse relation to `VideoJob`.** In `model VideoJob` (schema.prisma:917), add to the relation list (next to `contentPlanItems ContentPlanItem[]`):

```prisma
  publications     Publication[]
```

- [ ] **Step 3: Regenerate the client and build.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes; the generated client now types `publication.videoJob` / `videoJobId`.

(Note: applying the migration to a DB needs Postgres — `pnpm --filter @contento/db run db:migrate` in dev. Tests/typecheck only need the generated client from the step above. If a dev DB is available, also run `db:migrate` to create the migration SQL and commit it.)

- [ ] **Step 4: Typecheck the repo.**

Run: `pnpm typecheck`
Expected: PASS (no consumer references the new field yet).

- [ ] **Step 5: Commit.**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Publication.videoJobId FK linking a publication to its rendered video

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Telegram — `sendVideo` when a video URL is present

**Files:**
- Modify: `packages/platforms/src/telegram/publisher.ts`
- Modify: `packages/platforms/src/publishers.test.ts`

- [ ] **Step 1: Add the failing test.** In `packages/platforms/src/publishers.test.ts`, inside `describe('TelegramPublisher', ...)`, add:

```ts
  it('with video: calls sendVideo with the video URL and supports_streaming', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, result: { message_id: 123 } })
    )
    const publisher = new TelegramPublisher({ botToken: 'tok', channelId: '@chan' })
    const result = await publisher.publish({ text: 'Cap', videoUrl: 'https://x/v.mp4', imageUrl: 'https://x/i.png' })

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toContain('/sendVideo')
    const body = JSON.parse(init.body)
    expect(body.video).toBe('https://x/v.mp4')
    expect(body.supports_streaming).toBe(true)
    expect(result.platformPostId).toBe('123')
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t "with video"`
Expected: FAIL — current code hits `/sendPhoto` or `/sendMessage`, not `/sendVideo`.

- [ ] **Step 3: Implement.** Replace the entire `publish` method body in `packages/platforms/src/telegram/publisher.ts` with:

```ts
  async publish(payload: PublishPayload): Promise<PublishResult> {
    const { botToken, channelId } = this.creds
    const text = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    // Prefer video, then image, then plain text.
    // sendVideo accepts a remote HTTPS URL as `video` (same as sendPhoto's `photo`);
    // Telegram fetches it server-side. URL-based sends cap non-photo files at ~20MB.
    let endpoint: string
    let label: string
    let body: Record<string, unknown>

    if (payload.videoUrl) {
      endpoint = `${TG_API}/bot${botToken}/sendVideo`
      label = 'sendVideo'
      body = {
        chat_id: channelId,
        video: payload.videoUrl,
        caption: text.slice(0, 1024),
        parse_mode: 'HTML',
        supports_streaming: true,
      }
    } else if (payload.imageUrl) {
      endpoint = `${TG_API}/bot${botToken}/sendPhoto`
      label = 'sendPhoto'
      body = {
        chat_id: channelId,
        photo: payload.imageUrl,
        caption: text.slice(0, 1024),
        parse_mode: 'HTML',
      }
    } else {
      endpoint = `${TG_API}/bot${botToken}/sendMessage`
      label = 'sendMessage'
      body = {
        chat_id: channelId,
        text: text.slice(0, 4096),
        parse_mode: 'HTML',
      }
    }

    const res = await requestWithRetry(PLATFORM, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, label)

    const data = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!data.ok || !data.result) {
      throw new Error(`Telegram ${label} failed: ${data.description ?? 'unknown'}`)
    }

    return { platformPostId: String(data.result.message_id) }
  }
```

- [ ] **Step 4: Run the Telegram tests, verify all pass.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t Telegram`
Expected: PASS (existing text/image/error/hashtag tests + the new video test).

- [ ] **Step 5: Commit.**

```bash
git add packages/platforms/src/telegram/publisher.ts packages/platforms/src/publishers.test.ts
git commit -m "feat(platforms): Telegram sendVideo when a video URL is present

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: VK — upload the MP4 (`video.save` → upload → `wall.post`)

**Files:**
- Modify: `packages/platforms/src/vk/publisher.ts`
- Modify: `packages/platforms/src/publishers.test.ts`

- [ ] **Step 1: Add the failing test.** In `packages/platforms/src/publishers.test.ts`, inside `describe('VKPublisher', ...)` (create the describe block if absent), add:

```ts
  it('with video: video.save -> upload -> wall.post with video attachment', async () => {
    // 1) video.save
    fetchMock.mockResolvedValueOnce(
      mockResponse({ response: { upload_url: 'https://upl.vk/u', owner_id: -123, video_id: 456 } })
    )
    // download the mp4
    fetchMock.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response)
    // 2) upload POST
    fetchMock.mockResolvedValueOnce(mockResponse({ size: 8, video_id: 456 }))
    // 3) wall.post
    fetchMock.mockResolvedValueOnce(mockResponse({ response: { post_id: 789 } }))

    const publisher = new VKPublisher({ accessToken: 'tok', ownerId: '-123' })
    const result = await publisher.publish({ text: 'Hi', videoUrl: 'https://x/v.mp4' })

    const saveUrl = (fetchMock.mock.calls[0] as [string])[0]
    expect(saveUrl).toContain('/video.save')
    const wallCall = fetchMock.mock.calls[3] as [string, { body: URLSearchParams }]
    expect(wallCall[0]).toContain('/wall.post')
    expect(wallCall[1].body.toString()).toContain('attachments=video-123_456')
    expect(result.platformPostId).toBe('789')
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t "VK"`
Expected: FAIL — current code never calls `/video.save`.

- [ ] **Step 3: Implement.** Replace the `publish` method body in `packages/platforms/src/vk/publisher.ts` with:

```ts
  async publish(payload: PublishPayload): Promise<PublishResult> {
    const message = payload.hashtags?.length
      ? `${payload.text}\n\n${payload.hashtags.map(h => `#${h}`).join(' ')}`
      : payload.text

    // ownerId is negative for communities (e.g. "-123") and positive for users.
    const ownerIdNum = Number(this.creds.ownerId)
    const isGroup = ownerIdNum < 0

    // Default to the legacy image/text behavior (imageUrl is already a VK attachment string).
    let attachment: string | undefined = payload.imageUrl

    // When a 9:16 MP4 is present, prefer it: video.save -> upload bytes -> attach.
    if (payload.videoUrl) {
      const saveParams = new URLSearchParams({
        name: (payload.text || 'video').slice(0, 128),
        wallpost: '1',
        v: VK_VERSION,
        access_token: this.creds.accessToken,
        // Posting to a community wall: video.save wants the POSITIVE group id.
        ...(isGroup ? { group_id: String(Math.abs(ownerIdNum)) } : {}),
      })

      const saveRes = await requestWithRetry(PLATFORM, `${VK_API}/video.save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: saveParams,
      })
      if (!saveRes.ok) await throwForResponse(PLATFORM, saveRes, 'video.save')

      const saveData = (await saveRes.json()) as {
        response?: { upload_url: string; owner_id: number; video_id: number }
        error?: { error_msg: string }
      }
      if (saveData.error) throw new Error(`VK video.save failed: ${saveData.error.error_msg}`)
      if (!saveData.response?.upload_url) throw new Error('VK video.save did not return an upload_url')
      const { upload_url, owner_id, video_id } = saveData.response

      // Buffer the whole file so the multipart body is replayable across retries.
      const dl = await fetch(payload.videoUrl)
      if (!dl.ok) throw new Error(`VK video download failed: HTTP ${dl.status} for ${payload.videoUrl}`)
      const bytes = await dl.arrayBuffer()
      const form = new FormData()
      // Field name MUST be exactly "video_file".
      form.append('video_file', new Blob([bytes], { type: 'video/mp4' }), 'video.mp4')

      // Do NOT set Content-Type — fetch derives the multipart boundary itself.
      const uploadRes = await requestWithRetry(PLATFORM, upload_url, { method: 'POST', body: form })
      if (!uploadRes.ok) await throwForResponse(PLATFORM, uploadRes, 'video upload')

      // VK transcodes asynchronously; the attachment is valid immediately.
      attachment = `video${owner_id}_${video_id}`
    }

    const params = new URLSearchParams({
      owner_id: this.creds.ownerId,
      message: message.slice(0, 16383),
      v: VK_VERSION,
      access_token: this.creds.accessToken,
      ...(isGroup ? { from_group: '1' } : {}),
      ...(attachment ? { attachments: attachment } : {}),
    })

    const res = await requestWithRetry(PLATFORM, `${VK_API}/wall.post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    if (!res.ok) await throwForResponse(PLATFORM, res, 'wall.post')

    const data = (await res.json()) as {
      response?: { post_id: number }
      error?: { error_msg: string }
    }
    if (data.error) throw new Error(`VK wall.post failed: ${data.error.error_msg}`)
    if (!data.response?.post_id) throw new Error('VK did not return post_id')

    return {
      platformPostId: String(data.response.post_id),
      url: `https://vk.com/wall${this.creds.ownerId}_${data.response.post_id}`,
    }
  }
```

- [ ] **Step 4: Run the VK tests, verify they pass.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t "VK"`
Expected: PASS (the new video test + any existing VK tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/platforms/src/vk/publisher.ts packages/platforms/src/publishers.test.ts
git commit -m "feat(platforms): VK uploads MP4 via video.save and attaches it to wall.post

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Credential note (report, do not implement):** VK access tokens must now carry the `video` scope in addition to `wall`. Surface this to whoever provisions VK tokens; no code field changes (`ownerId` sign already encodes user vs community).

---

### Task 6: Instagram — REELS async flow when a video URL is present

**Files:**
- Modify: `packages/platforms/src/instagram/publisher.ts`
- Modify: `packages/platforms/src/publishers.test.ts`

- [ ] **Step 1: Add the failing test.** In `describe('InstagramPublisher', ...)` add:

```ts
  it('with video: creates REELS container, polls FINISHED, then publishes', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'cont1' }))        // container create
    fetchMock.mockResolvedValueOnce(mockResponse({ status_code: 'FINISHED' })) // status poll
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 'media1' }))       // media_publish

    const publisher = new InstagramPublisher({ accessToken: 'tok', igUserId: 'u1' })
    const result = await publisher.publish({ text: 'Cap', videoUrl: 'https://x/v.mp4' })

    const createBody = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body)
    expect(createBody.media_type).toBe('REELS')
    expect(createBody.video_url).toBe('https://x/v.mp4')
    expect((fetchMock.mock.calls[1] as [string])[0]).toContain('cont1?fields=status_code')
    expect(result.platformPostId).toBe('media1')
  }, 15000)
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t "with video: creates REELS"`
Expected: FAIL — current code only does the IMAGE container flow.

- [ ] **Step 3: Implement.** Replace the entire `publish` method body in `packages/platforms/src/instagram/publisher.ts` with:

```ts
  async publish(payload: PublishPayload): Promise<PublishResult> {
    const { accessToken, igUserId } = this.creds

    const caption = (
      payload.hashtags?.length
        ? `${payload.text}\n\n${payload.hashtags.map((h) => `#${h}`).join(' ')}`
        : payload.text
    ).slice(0, 2200)

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    }

    // VIDEO (REELS): create container -> poll status_code -> media_publish (async).
    if (payload.videoUrl) {
      const containerRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: payload.videoUrl,
          caption,
          share_to_feed: true,
        }),
      })
      if (!containerRes.ok) await throwForResponse(PLATFORM, containerRes, 'reels container create')

      const container = (await containerRes.json()) as { id?: string; error?: { message: string } }
      if (!container.id) {
        throw new Error(`Instagram reels container creation failed: ${container.error?.message ?? 'no id'}`)
      }
      const creationId = container.id

      const POLL_INTERVAL_MS = 5_000
      const MAX_ATTEMPTS = 60 // ~5 min
      let finished = false
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        const statusRes = await requestWithRetry(
          PLATFORM,
          `${GRAPH_API}/${creationId}?fields=status_code,status`,
          { method: 'GET', headers },
        )
        if (!statusRes.ok) await throwForResponse(PLATFORM, statusRes, 'reels status poll')
        const status = (await statusRes.json()) as {
          status_code?: 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'PUBLISHED' | 'EXPIRED'
          status?: string
          error?: { message: string }
        }
        if (status.status_code === 'FINISHED') { finished = true; break }
        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
          throw new Error(
            `Instagram reels processing ${status.status_code}: ${status.status ?? status.error?.message ?? 'unknown error'}`,
          )
        }
        // IN_PROGRESS / transient missing status_code -> keep polling.
      }
      if (!finished) {
        throw new Error(
          `Instagram reels processing timed out after ${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s (container ${creationId})`,
        )
      }

      const publishRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media_publish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ creation_id: creationId }),
      })
      if (!publishRes.ok) await throwForResponse(PLATFORM, publishRes, 'reels publish')
      const published = (await publishRes.json()) as { id?: string; error?: { message: string } }
      if (!published.id) throw new Error(`Instagram reels publish failed: ${published.error?.message ?? 'no id'}`)
      return { platformPostId: published.id }
    }

    // IMAGE: unchanged fallback.
    if (!payload.imageUrl) {
      throw new Error('Instagram requires an image URL or a video URL')
    }

    const containerRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_url: payload.imageUrl,
        caption,
        media_type: 'IMAGE',
      }),
    })
    if (!containerRes.ok) await throwForResponse(PLATFORM, containerRes, 'container create')
    const container = (await containerRes.json()) as { id?: string; error?: { message: string } }
    if (!container.id) {
      throw new Error(`Instagram container creation failed: ${container.error?.message ?? 'no id'}`)
    }

    await new Promise((r) => setTimeout(r, 5000))

    const publishRes = await requestWithRetry(PLATFORM, `${GRAPH_API}/${igUserId}/media_publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ creation_id: container.id }),
    })
    if (!publishRes.ok) await throwForResponse(PLATFORM, publishRes, 'publish')
    const published = (await publishRes.json()) as { id?: string; error?: { message: string } }
    if (!published.id) {
      throw new Error(`Instagram publish failed: ${published.error?.message ?? 'no id'}`)
    }
    return { platformPostId: published.id }
  }
```

- [ ] **Step 4: Run the Instagram tests, verify they pass.**

Run: `pnpm --filter @contento/platforms exec vitest run src/publishers.test.ts -t Instagram`
Expected: PASS (existing image test + the new REELS test). The REELS test resolves the first poll as `FINISHED`, so the 5s interval fires once (~5s; the test timeout is 15s).

- [ ] **Step 5: Commit.**

```bash
git add packages/platforms/src/instagram/publisher.ts packages/platforms/src/publishers.test.ts
git commit -m "feat(platforms): Instagram Reels async publish (container -> poll FINISHED -> publish)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: TikTok + YouTube — prefer `videoUrl`

**Files:**
- Modify: `packages/platforms/src/tiktok/publisher.ts`
- Modify: `packages/platforms/src/youtube/publisher.ts`

- [ ] **Step 1: TikTok.** In `packages/platforms/src/tiktok/publisher.ts`, replace the opening guard and the `source_info.video_url` value:

Replace:
```ts
    if (!payload.imageUrl) throw new Error('TikTok requires a video/image URL')
```
with:
```ts
    const videoUrl = payload.videoUrl ?? payload.imageUrl
    if (!videoUrl) throw new Error('TikTok requires a video URL')
```
and in the request body change `video_url: payload.imageUrl` to `video_url: videoUrl`.

- [ ] **Step 2: YouTube.** In `packages/platforms/src/youtube/publisher.ts`, replace the opening guard and the `fetchVideoBody` source:

Replace:
```ts
    if (!payload.imageUrl) throw new Error('YouTube requires a video URL')
```
with:
```ts
    const videoUrl = payload.videoUrl ?? payload.imageUrl
    if (!videoUrl) throw new Error('YouTube requires a video URL')
```
and replace `await fetchVideoBody(payload.imageUrl!)` with `await fetchVideoBody(videoUrl)`.

- [ ] **Step 3: Typecheck + run platform tests.**

Run: `pnpm --filter @contento/platforms run typecheck && pnpm --filter @contento/platforms exec vitest run`
Expected: PASS (all publisher tests).

- [ ] **Step 4: Commit.**

```bash
git add packages/platforms/src/tiktok/publisher.ts packages/platforms/src/youtube/publisher.ts
git commit -m "feat(platforms): TikTok and YouTube prefer videoUrl over imageUrl

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: posting-service — presign the private video URL and put it in the payload

**Files:**
- Create: `apps/posting-service/src/s3.ts`
- Modify: `apps/posting-service/package.json`
- Modify: `apps/posting-service/src/worker.ts`

- [ ] **Step 1: Add aws-sdk deps.** In `apps/posting-service/package.json` `dependencies`, add (same versions as `apps/video-worker`):

```json
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
```
Then from the repo root: `pnpm install`.

- [ ] **Step 2: Create the presign module.** Create `apps/posting-service/src/s3.ts`:

```ts
// Presign helper for the posting-service. VideoJob.outputUrl is a path-style
// MinIO/S3 URL on a PRIVATE bucket. External platforms (TikTok PULL_FROM_URL,
// YouTube fetch, Instagram video_url) must fetch the asset over the public
// internet, so we presign a short-lived GET URL. Mirrors apps/video-worker/src/s3-client.ts.
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'contento',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'contento123',
  },
  forcePathStyle: true,
})

/** Extract the S3 object key from a path-style URL produced by uploadVideo/uploadBuffer. */
export function keyFromUrl(url: string): string {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const path = new URL(url).pathname.replace(/^\/+/, '')
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
}

/** True when the URL points at our S3/MinIO endpoint (a private bucket needing presign). */
export function isOwnS3Url(url: string): boolean {
  const endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000'
  return url.startsWith(`${endpoint}/`)
}

/** Presigned GET URL so an external platform's servers can download the video. */
export async function presignGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSignedUrl(s3 as any, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec })
}
```

- [ ] **Step 3: Wire it into the worker.** In `apps/posting-service/src/worker.ts`:

3a. Add the import near the top (after the `@contento/platforms` import):
```ts
import { presignGetUrl, isOwnS3Url, keyFromUrl } from './s3.js'
```

3b. Add `videoJob: true` to the publication `findUnique` include:
```ts
        const publication = await prisma.publication.findUnique({
          where: { id: publicationId },
          include: { script: true, renderJob: true, socialAccount: true, videoJob: true },
        })
```

3c. Replace the `payload` construction block:
```ts
        const payload: PublishPayload = {
          text: taggedCaption,
          ...(publication.renderJob?.outputUrl ? { imageUrl: publication.renderJob.outputUrl } : {}),
          hashtags: publication.script.hashtags,
        }
```
with:
```ts
        // Prefer the generated video. The MP4 lives in a private bucket, so presign
        // a short-lived GET URL the platform's servers can fetch over the internet.
        const rawVideoUrl = publication.videoJob?.outputUrl ?? null
        let videoUrl: string | null = rawVideoUrl
        if (rawVideoUrl && isOwnS3Url(rawVideoUrl)) {
          videoUrl = await presignGetUrl(keyFromUrl(rawVideoUrl), 3600)
        }

        const payload: PublishPayload = {
          text: taggedCaption,
          ...(videoUrl ? { videoUrl } : {}),
          ...(publication.renderJob?.outputUrl ? { imageUrl: publication.renderJob.outputUrl } : {}),
          hashtags: publication.script.hashtags,
        }
```

- [ ] **Step 4: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/posting-service run typecheck`
Expected: PASS (`publication.videoJob` is now typed from Task 3's client).

- [ ] **Step 5: Commit.**

```bash
git add apps/posting-service/src/s3.ts apps/posting-service/package.json apps/posting-service/src/worker.ts pnpm-lock.yaml
git commit -m "feat(posting-service): presign VideoJob.outputUrl and pass it as payload.videoUrl

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Deploy caveat (report):** presigned `localhost` MinIO URLs are not reachable by real platforms; this works only against prod S3/CDN. TikTok `PULL_FROM_URL` additionally requires the URL host to be a verified domain in the TikTok dev portal. Irrelevant under `HIGGSFIELD_MOCK`.

---

### Task 9: Campaign approve handler — link the video to the publication

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`

- [ ] **Step 1: Set `videoJobId` on the created Publication.** In `apps/api/src/routes/campaigns.ts`, in the `PUT /campaigns/:campaignId/items/:itemId/approve` handler, the `prisma.publication.create` currently sets `renderJobId: null`. Add the video link from the approved content-plan item:

```ts
        const pub = await prisma.publication.create({
          data: {
            workspaceId,
            scriptId: approved.scriptId,
            socialAccountId,
            scheduledAt: approved.scheduledDate,
            renderJobId: null,
            videoJobId: approved.videoJobId,
          },
        })
```

(`approved` is the updated `ContentPlanItem`; it already carries `videoJobId`. Keep the surrounding `socialAccountId` resolution and the subsequent `contentPlanItem.update({ publicationId, status })` exactly as they are.)

- [ ] **Step 2: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add apps/api/src/routes/campaigns.ts
git commit -m "feat(api): link the rendered VideoJob to the Publication on campaign item approve

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: `VideoProvider` abstraction (enabler for the lipsync decision point)

**Files:**
- Create: `packages/ai/src/video-provider.ts`
- Create: `packages/ai/src/higgsfield/provider.ts`
- Create: `packages/ai/src/higgsfield/provider.test.ts`
- Modify: `packages/ai/src/index.ts`
- Delete: `packages/ai/src/video/higgsfield.ts`
- Modify: `apps/video-worker/src/worker.ts`

- [ ] **Step 1: Define the interface.** Create `packages/ai/src/video-provider.ts`:

```ts
/**
 * Vendor-agnostic video generation. The worker depends on this, not on a concrete
 * vendor, so the lipsync/avatar engine can be swapped (Higgsfield / Sync.so / HeyGen)
 * by adding an implementation and selecting it via VIDEO_PROVIDER.
 */
export interface VideoProvider {
  /** Upload audio bytes and return a URL the provider can fetch (for lip-sync input). */
  uploadAudio(data: Buffer, contentType: string): Promise<string>
  /** Generate a still character frame; returns an image URL. */
  characterFrame(prompt: string, opts: { characterId: string; seed?: number }): Promise<string>
  /** Talking-head clip with lip-sync; returns a video clip URL. */
  talkingHead(opts: { imageUrl: string; audioUrl: string; prompt: string; audioDurationSec: number }): Promise<string>
  /** Silent motion clip from a still image; returns a video clip URL. */
  motionFromImage(opts: { imageUrl: string; prompt: string; seed?: number }): Promise<string>
}
```

- [ ] **Step 2: Write the failing provider test.** Create `packages/ai/src/higgsfield/provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const submitSoul = vi.fn()
const submitTalking = vi.fn()
const submitMotion = vi.fn()
const poll = vi.fn()
const upload = vi.fn()

vi.mock('./client.js', () => ({
  submitSoulCharacterFrame: submitSoul,
  submitTalkingAvatarClip: submitTalking,
  submitImageToVideo: submitMotion,
  pollJobUntilDone: poll,
  uploadToHiggsfield: upload,
}))

import { HiggsfieldProvider } from './provider.js'

beforeEach(() => vi.clearAllMocks())

describe('HiggsfieldProvider', () => {
  it('characterFrame submits then polls and returns the image url', async () => {
    submitSoul.mockResolvedValue('job-1')
    poll.mockResolvedValue('https://hf/img.png')
    const p = new HiggsfieldProvider()
    const url = await p.characterFrame('a man', { characterId: 'soul-1', seed: 7 })
    expect(submitSoul).toHaveBeenCalledWith('a man', 'soul-1', { seed: 7 })
    expect(poll).toHaveBeenCalledWith('job-1')
    expect(url).toBe('https://hf/img.png')
  })

  it('talkingHead submits the speak job then polls', async () => {
    submitTalking.mockResolvedValue('job-2')
    poll.mockResolvedValue('https://hf/clip.mp4')
    const p = new HiggsfieldProvider()
    const url = await p.talkingHead({ imageUrl: 'i', audioUrl: 'a', prompt: 'p', audioDurationSec: 7 })
    expect(submitTalking).toHaveBeenCalledWith('i', 'a', 'p', 7)
    expect(url).toBe('https://hf/clip.mp4')
  })

  it('motionFromImage submits dop then polls', async () => {
    submitMotion.mockResolvedValue('job-3')
    poll.mockResolvedValue('https://hf/silent.mp4')
    const p = new HiggsfieldProvider()
    const url = await p.motionFromImage({ imageUrl: 'i', prompt: 'p', seed: 5 })
    expect(submitMotion).toHaveBeenCalledWith('i', 'p', { seed: 5 })
    expect(url).toBe('https://hf/silent.mp4')
  })
})
```

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/provider.test.ts`
Expected: FAIL — `./provider.js` does not exist.

- [ ] **Step 3: Implement the Higgsfield provider.** Create `packages/ai/src/higgsfield/provider.ts`:

```ts
import type { VideoProvider } from '../video-provider.js'
import {
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  uploadToHiggsfield,
} from './client.js'

/** VideoProvider backed by Higgsfield (Soul + Speak + DoP). */
export class HiggsfieldProvider implements VideoProvider {
  uploadAudio(data: Buffer, contentType: string): Promise<string> {
    return uploadToHiggsfield(data, contentType)
  }

  async characterFrame(prompt: string, opts: { characterId: string; seed?: number }): Promise<string> {
    const jobSetId = await submitSoulCharacterFrame(
      prompt,
      opts.characterId,
      ...(opts.seed != null ? [{ seed: opts.seed }] as const : []),
    )
    return pollJobUntilDone(jobSetId)
  }

  async talkingHead(opts: { imageUrl: string; audioUrl: string; prompt: string; audioDurationSec: number }): Promise<string> {
    const jobSetId = await submitTalkingAvatarClip(opts.imageUrl, opts.audioUrl, opts.prompt, opts.audioDurationSec)
    return pollJobUntilDone(jobSetId)
  }

  async motionFromImage(opts: { imageUrl: string; prompt: string; seed?: number }): Promise<string> {
    const jobSetId = await submitImageToVideo(
      opts.imageUrl,
      opts.prompt,
      ...(opts.seed != null ? [{ seed: opts.seed }] as const : []),
    )
    return pollJobUntilDone(jobSetId)
  }
}

/** Select the video provider. Only 'higgsfield' exists today; the env hook lets a future
 *  Sync.so/HeyGen impl be swapped in without touching the worker. */
export function createVideoProvider(name: string = process.env['VIDEO_PROVIDER'] ?? 'higgsfield'): VideoProvider {
  switch (name) {
    case 'higgsfield':
      return new HiggsfieldProvider()
    default:
      throw new Error(`Unknown VIDEO_PROVIDER: ${name}`)
  }
}
```

> Note on the spread in `characterFrame`/`motionFromImage`: `submitSoulCharacterFrame`/`submitImageToVideo` take an optional 3rd `{ seed }` arg. The conditional spread keeps the call identical to the worker's current `{ seed }` usage while satisfying `exactOptionalPropertyTypes`. If the repo's TS config rejects the tuple spread, replace with a plain `if (opts.seed != null)` branch calling the function with/without the options arg.

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Export from the package.** In `packages/ai/src/index.ts`, add:

```ts
export type { VideoProvider } from './video-provider.js'
export { HiggsfieldProvider, createVideoProvider } from './higgsfield/provider.js'
```

- [ ] **Step 5: Delete the dead duplicate client.**

```bash
rm packages/ai/src/video/higgsfield.ts
rmdir packages/ai/src/video 2>/dev/null || true
```
Then confirm nothing imported it:
Run: `git grep -n "video/higgsfield" -- '*.ts' || echo "no references"`
Expected: `no references` (it was never exported from `index.ts`).

- [ ] **Step 6: Route the worker through the provider.** In `apps/video-worker/src/worker.ts`:

6a. Replace the direct Higgsfield submit imports with the provider. Change the `@contento/ai` import block: remove `submitSoulCharacterFrame, submitTalkingAvatarClip, submitImageToVideo, pollJobUntilDone, uploadToHiggsfield` and add `createVideoProvider`, keeping the rest (`generateVideoStoryboard, synthesizeSpeechWithTimestamps, wavDurationSec, isMockMode, MOCK_CLIP_URL`, types). The block becomes:

```ts
import {
  generateVideoStoryboard,
  synthesizeSpeechWithTimestamps,
  wavDurationSec,
  isMockMode,
  MOCK_CLIP_URL,
  createVideoProvider,
} from '@contento/ai'
import type { WordTiming } from '@contento/ai'
```

6b. In `handleGenerate`, construct the provider once before the shot loop (next to `const seed = jobSeed(videoJobId)`):

```ts
  const provider = createVideoProvider()
```

6c. In the non-mock shot branch, replace the audio upload + the Step 2/3/4 calls. Replace this block:

```ts
          audioUrl = await uploadToHiggsfield(wavBuffer, 'audio/x-wav')
          shotTimings.push({ index: shot.index, audioSec, words: tts.words })
        }

        // Step 2: Higgsfield Soul Character → character image
        const charRequestId = await submitSoulCharacterFrame(shot.prompt, soulId, { seed })
        const imageUrl = await pollJobUntilDone(charRequestId)

        // Step 3a: talking avatar with lip-sync (has dialogue + audio)
        // Step 3b: silent motion video via DoP (no dialogue)
        let videoRequestId: string
        if (audioUrl) {
          videoRequestId = await submitTalkingAvatarClip(imageUrl, audioUrl, shot.prompt, audioSec)
        } else {
          videoRequestId = await submitImageToVideo(imageUrl, shot.prompt, { seed })
        }

        // Step 4: poll until clip is ready
        const higgsfieldClipUrl = await pollJobUntilDone(videoRequestId)
```

with:

```ts
          audioUrl = await provider.uploadAudio(wavBuffer, 'audio/x-wav')
          shotTimings.push({ index: shot.index, audioSec, words: tts.words })
        }

        // Step 2: character image (provider hides submit+poll)
        const imageUrl = await provider.characterFrame(shot.prompt, { characterId: soulId, seed })

        // Step 3: talking avatar (has dialogue) or silent motion clip (no dialogue)
        const higgsfieldClipUrl = audioUrl
          ? await provider.talkingHead({ imageUrl, audioUrl, prompt: shot.prompt, audioDurationSec: audioSec })
          : await provider.motionFromImage({ imageUrl, prompt: shot.prompt, seed })
```

(Everything else in the shot loop — the `soulId` guard, the S3 re-upload of `higgsfieldClipUrl`, the `clipKey`, the shot status update — stays unchanged. `soulId` is now passed as `characterId`.)

- [ ] **Step 7: Update the worker test mock.** In `apps/video-worker/src/video-worker.test.ts`, the `@contento/ai` mock factory lists `submitSoulCharacterFrame`/`submitTalkingAvatarClip`/`submitImageToVideo`/`pollJobUntilDone`/`uploadToHiggsfield`. Those are no longer imported by the worker (mock mode is used in tests, so the provider is constructed but its methods aren't called). Add `createVideoProvider` to the mock and leave the others (harmless):

```ts
  createVideoProvider: () => ({
    uploadAudio: vi.fn(),
    characterFrame: vi.fn(),
    talkingHead: vi.fn(),
    motionFromImage: vi.fn(),
  }),
```

- [ ] **Step 8: Build + typecheck + tests.**

Run: `pnpm --filter @contento/ai run build && pnpm --filter @contento/video-worker run typecheck && pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS (worker tests still green — generate path uses mock mode; the provider is only exercised in non-mock).

- [ ] **Step 9: Commit.**

```bash
git add packages/ai/src/video-provider.ts packages/ai/src/higgsfield/provider.ts packages/ai/src/higgsfield/provider.test.ts packages/ai/src/index.ts apps/video-worker/src/worker.ts apps/video-worker/src/video-worker.test.ts
git rm packages/ai/src/video/higgsfield.ts
git commit -m "refactor(ai): route video generation through a VideoProvider interface; delete dead higgsfield client

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

- [ ] **Step 1: Repo-wide typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test`
Expected: typecheck 21/21; tests green except the known pre-existing `@contento/api` background-worker Prisma error (documented; out of scope).

- [ ] **Step 2: Confirm the data path by reading, not asserting.** Trace once in code that: campaign approve → `Publication.videoJobId` set (Task 9) → posting-service includes `videoJob`, presigns `outputUrl` → `payload.videoUrl` (Task 8) → each video publisher consumes `videoUrl` (Tasks 4–7) → scheduled path carries `platform` (Task 1). Note any gap found as a follow-up rather than forcing a fix here.

---

## Out of scope (report as follow-ups, do not implement here)
- **LinkedIn video** (register-upload asset flow) — text-only today; lower priority for the RU beta.
- **DB column/route renames** (`higgsfieldJobId → providerJobId`, `/webhooks/higgsfield`) — cosmetic; the `VideoProvider` interface already unblocks the lipsync A/B without them.
- **AIGC disclosure flags** — P1 in the parent plan; no trivial publish-API field exists for IG/TG/VK, so it needs design.
- **BullMQ retries/DLQ** — P1; must make `handleGenerate.createMany` idempotent first.
- **`packages/ai/src` stray compiled `.js`** — same junk cleaned from brand-kit; out of this plan.

## Risks / decisions surfaced
- **VK token scope** must add `video`; **TikTok** needs a verified URL domain for `PULL_FROM_URL`. Provisioning concern, not code.
- **Telegram URL send caps non-photo files at ~20MB** — a long/high-bitrate MP4 would be rejected; multipart upload fallback is a later enhancement.
- **Presign only works against a publicly reachable S3/CDN** — local MinIO won't be fetched by real platforms (fine under mock).
- **Task 10 (VideoProvider) is the enabler** for the lipsync decision point; Tasks 1–9 are the "video actually publishes" core and can ship without it if you'd rather close the decision first.
