# Plan A: PlatformProfile + per-platform fan-out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each platform get its own video, tailored to that platform's length / caption style / hook window, via a static `PlatformProfile` config and an item-per-platform content plan — building on the now-merged P0 (video reaches publication).

**Architecture:** Decided model = **item-per-platform** (not the spec's relation-flip): a `ContentPlanItem` carries one `platform`; the content plan fans each planned topic across the campaign's `targetPlatforms` (so N topics × M platforms = N×M items). The existing per-item campaign-producer loop, approve handler, and Stop-race gating stay intact — each item still produces exactly one `VideoJob` and one `Publication`, now platform-specific. A static `PlatformProfile` (packages/shared) drives `scriptwriter` (caption style, length, hashtags) and `video-storyboard` (duration band, hook window). Avatar-only; `shotType`/multi-format is Plan B.

**Tech Stack:** TS ESM (NodeNext `.js` imports), pnpm + Turborepo, vitest, Prisma (Postgres), Fastify, Anthropic SDK.

**Verified current state (post-P0):**
- `Campaign` has no platform field. `ContentPlanItem` has `topic, format, hook, scheduledDate, scriptId?, videoJobId?, publicationId?` — no `platform`. `VideoJob` has no `platform`.
- `content-plan/generate` (campaigns.ts:173) calls `generateContentPlan(...)` → drafts `{index,topic,format,scheduledDate,hook}`, persisted as items in a `$transaction` (campaigns.ts).
- `campaign-producer.ts` per item: `writeScript(workspaceId, { title: item.topic, angle: item.hook, format: item.format, platform: 'instagram' })` (hardcoded), then `prisma.videoJob.create({ data: { workspaceId, scriptId, status:'PENDING', language:'ru', aspectRatio:'9:16' } })`, then `generateVideoStoryboard(...)` runs in the worker.
- `scriptwriter.writeScript(workspaceId, { title, angle, format, platform })` already takes `platform` but ignores it in the prompt.
- `generateVideoStoryboard(workspaceId, {hook,body,cta}, options?:{shotCount?,characterDescription?,language?})`.
- approve handler (campaigns.ts) picks `socialAccount = prisma.socialAccount.findFirst({ where:{workspaceId}, orderBy:{createdAt:'asc'} })` — NOT matched to platform.
- `SocialPlatformSchema` (packages/shared) = telegram, instagram, tiktok, youtube, linkedin (vk/x removed in P0).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/platform-profiles.ts` | create | static `PlatformProfile` per platform + `getPlatformProfile`, `TARGET_PLATFORMS` |
| `packages/shared/src/platform-profiles.test.ts` | create | profile values + default |
| `packages/shared/src/index.ts` | modify | export the above |
| `packages/db/prisma/schema.prisma` | modify | `Campaign.targetPlatforms String[]`, `ContentPlanItem.platform String?`, `VideoJob.platform String?` |
| `packages/ai/src/agents/scriptwriter.ts` | modify | profile-driven caption style / length / hashtags |
| `packages/ai/src/agents/scriptwriter.test.ts` (in agents.test.ts) | modify | assert platform instruction injected |
| `packages/ai/src/agents/video-storyboard.ts` | modify | profile-driven duration band + hook window |
| `apps/api/src/routes/campaigns.ts` | modify | accept `targetPlatforms`; fan items per platform; approve picks platform-matched SocialAccount |
| `apps/api/src/jobs/campaign-producer.ts` | modify | use `item.platform` + profile in writeScript/storyboard/VideoJob.create |

---

### Task 1: `PlatformProfile` static config

**Files:** Create `packages/shared/src/platform-profiles.ts`, `packages/shared/src/platform-profiles.test.ts`; Modify `packages/shared/src/index.ts`.

- [ ] **Step 1: Failing test.** Create `packages/shared/src/platform-profiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getPlatformProfile, TARGET_PLATFORMS } from './platform-profiles.js'

describe('getPlatformProfile', () => {
  it('TikTok prefers native sound and a 21-34s band with a 3s hook', () => {
    const p = getPlatformProfile('tiktok')
    expect(p.nativeSoundImportance).toBe('high')
    expect(p.targetDurationSec.ideal).toBe(28)
    expect(p.hookWindowSec).toBe(3)
    expect(p.captionStyle).toBe('conversational-trend')
  })
  it('YouTube Shorts uses SEO captions and a tight hook', () => {
    const p = getPlatformProfile('youtube')
    expect(p.captionStyle).toBe('seo-keyword-first')
    expect(p.hookWindowSec).toBe(2)
  })
  it('every profile discloses AIGC', () => {
    for (const pl of TARGET_PLATFORMS) expect(getPlatformProfile(pl).aigcDisclosure).toBe(true)
  })
  it('falls back to instagram for an unknown platform', () => {
    expect(getPlatformProfile('nope').platform).toBe('instagram')
  })
})
```

- [ ] **Step 2: Verify it fails.** Run: `pnpm --filter @contento/shared exec vitest run src/platform-profiles.test.ts` → FAIL (no module).

- [ ] **Step 3: Implement.** Create `packages/shared/src/platform-profiles.ts`:

```ts
// Static per-platform content profiles (RU-speaking diaspora + CIS). Values from the
// 2026 platform research synthesis. Drives length, caption style, hook, and AIGC
// disclosure so each platform gets a tailored video. Code-defined (not user-editable) for MVP.
export type TargetPlatform = 'tiktok' | 'instagram' | 'youtube' | 'telegram'

export interface PlatformProfile {
  platform: TargetPlatform
  targetDurationSec: { min: number; ideal: number; max: number }
  hookWindowSec: number
  captionStyle: 'seo-keyword-first' | 'conversational-trend'
  hashtagCount: number
  captionMaxLen: number
  nativeSoundImportance: 'high' | 'low'
  aigcDisclosure: true
}

const PROFILES: Record<TargetPlatform, PlatformProfile> = {
  tiktok: {
    platform: 'tiktok', targetDurationSec: { min: 21, ideal: 28, max: 34 }, hookWindowSec: 3,
    captionStyle: 'conversational-trend', hashtagCount: 4, captionMaxLen: 2200,
    nativeSoundImportance: 'high', aigcDisclosure: true,
  },
  instagram: {
    platform: 'instagram', targetDurationSec: { min: 15, ideal: 20, max: 30 }, hookWindowSec: 3,
    captionStyle: 'seo-keyword-first', hashtagCount: 5, captionMaxLen: 2200,
    nativeSoundImportance: 'low', aigcDisclosure: true,
  },
  youtube: {
    platform: 'youtube', targetDurationSec: { min: 20, ideal: 28, max: 35 }, hookWindowSec: 2,
    captionStyle: 'seo-keyword-first', hashtagCount: 3, captionMaxLen: 100,
    nativeSoundImportance: 'low', aigcDisclosure: true,
  },
  telegram: {
    platform: 'telegram', targetDurationSec: { min: 20, ideal: 30, max: 45 }, hookWindowSec: 3,
    captionStyle: 'conversational-trend', hashtagCount: 3, captionMaxLen: 1024,
    nativeSoundImportance: 'low', aigcDisclosure: true,
  },
}

export const TARGET_PLATFORMS: TargetPlatform[] = ['tiktok', 'instagram', 'youtube', 'telegram']

/** Profile for a platform; falls back to instagram for unknown/legacy values. */
export function getPlatformProfile(platform: string): PlatformProfile {
  return PROFILES[platform as TargetPlatform] ?? PROFILES.instagram
}
```

- [ ] **Step 4: Verify pass.** Same vitest command → PASS (4 tests).

- [ ] **Step 5: Export.** In `packages/shared/src/index.ts` add:

```ts
export { getPlatformProfile, TARGET_PLATFORMS } from './platform-profiles.js'
export type { PlatformProfile, TargetPlatform } from './platform-profiles.js'
```

- [ ] **Step 6: Typecheck + commit.** Run: `pnpm --filter @contento/shared run typecheck` → PASS.

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add packages/shared/src/platform-profiles.ts packages/shared/src/platform-profiles.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): static PlatformProfile config (length, caption style, hook, AIGC) per platform

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema — platform on Campaign / ContentPlanItem / VideoJob

**Files:** Modify `packages/db/prisma/schema.prisma`.

- [ ] **Step 1: Edit the three models.**
- In `model Campaign`, after `targetAction String`, add:
```prisma
  targetPlatforms String[]       @default(["tiktok", "instagram", "youtube", "telegram"])
```
- In `model ContentPlanItem`, after `format String`, add:
```prisma
  platform      String?
```
- In `model VideoJob`, after `language String @default("ru")`, add:
```prisma
  platform     String?
```

- [ ] **Step 2: Regenerate + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes.
Run: `pnpm typecheck`
Expected: 21/21 (no consumer references the fields yet).

- [ ] **Step 3: Commit.**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add Campaign.targetPlatforms, ContentPlanItem.platform, VideoJob.platform

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Note: a live `db:migrate` needs Postgres; the generated client from Step 2 is sufficient for typecheck/tests.)

---

### Task 3: scriptwriter — tailor caption/length/hashtags to the platform

**Files:** Modify `packages/ai/src/agents/scriptwriter.ts`; add a test in `packages/ai/src/agents/agents.test.ts`.

- [ ] **Step 1: Implement.** In `packages/ai/src/agents/scriptwriter.ts`, add the import and a profile-instruction builder, and inject it into the system blocks. Add at the top:

```ts
import { getPlatformProfile } from '@contento/shared'
```

Add this helper above `writeScript`:

```ts
function platformInstruction(platform: string): string {
  const p = getPlatformProfile(platform)
  const captionGuide =
    p.captionStyle === 'seo-keyword-first'
      ? 'Write the caption SEO-first: lead with the keyword phrase a viewer would search; the platform indexes caption + on-screen text + voiceover.'
      : 'Write the caption conversational and hook-forward in colloquial Russian; open a curiosity/comment loop.'
  return [
    `Target platform: ${p.platform}.`,
    `The spoken script must fit a ${p.targetDurationSec.min}-${p.targetDurationSec.max}s video (aim ${p.targetDurationSec.ideal}s, ~${Math.round(p.targetDurationSec.ideal * 2.5)} words of voiceover).`,
    `The hook must land within the first ${p.hookWindowSec} seconds.`,
    captionGuide,
    `Caption max ${p.captionMaxLen} characters. Provide exactly ${p.hashtagCount} hashtags.`,
    'Write all output in Russian.',
  ].join('\n')
}
```

In `writeScript`, change the `system` array to include the platform instruction:

```ts
    system: [
      systemBlock,
      { type: 'text', text: SCHEMA_INSTRUCTION },
      { type: 'text', text: platformInstruction(idea.platform) },
    ],
```

(Signature and return type unchanged; `idea.platform` already exists.)

- [ ] **Step 2: Test.** In `packages/ai/src/agents/agents.test.ts`, add a test asserting the platform instruction is injected. Find the existing scriptwriter test (it mocks the Anthropic client and inspects the `system` argument) and add:

```ts
  it('writeScript injects platform-specific instruction (tiktok hook window)', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ hook: 'h', body: 'b', cta: 'c', caption: 'cap', hashtags: ['#a'] }) }],
    })
    await writeScript('ws1', { title: 't', angle: 'a', format: 'reel', platform: 'tiktok' })
    const call = mockCreate.mock.calls.at(-1)![0]
    const systemText = call.system.map((s: { text: string }) => s.text).join('\n')
    expect(systemText).toContain('Target platform: tiktok')
    expect(systemText).toContain('first 3 seconds')
  })
```

(Match the file's existing mock variable names — if the Anthropic mock is named differently than `mockCreate`, use that name. If the scriptwriter test there uses a different harness, mirror it.)

- [ ] **Step 2b: Verify.** Run: `pnpm --filter @contento/ai exec vitest run src/agents/agents.test.ts` → PASS (existing + new test).

- [ ] **Step 3: Typecheck + commit.** Run: `pnpm --filter @contento/ai run typecheck` → PASS.

```bash
git add packages/ai/src/agents/scriptwriter.ts packages/ai/src/agents/agents.test.ts
git commit -m "feat(ai): scriptwriter tailors caption style, length, and hashtags to the target platform

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: video-storyboard — duration band + hook window from the profile

**Files:** Modify `packages/ai/src/agents/video-storyboard.ts`.

- [ ] **Step 1: Implement.** Add an optional `platform` to the options and use the profile to set the duration target + hook window. Add import:

```ts
import { getPlatformProfile } from '@contento/shared'
```

Extend the options type and derive duration. In `generateVideoStoryboard`, change the options destructuring to also read `platform`, and replace the fixed "Total duration should be 15–60 seconds" rule line with profile-driven text. Concretely, add near the top of the function body:

```ts
  const profile = options?.platform ? getPlatformProfile(options.platform) : undefined
  const durationLine = profile
    ? `Total video duration MUST be ${profile.targetDurationSec.min}-${profile.targetDurationSec.max} seconds (aim ${profile.targetDurationSec.ideal}s). The hook (first shot) must land within ${profile.hookWindowSec}s.`
    : 'Total duration should be 15–60 seconds.'
```

Then in the system prompt array, replace the existing rule string `'  - Total duration should be 15–60 seconds'` with `'  - ' + durationLine`. And add `platform?: string` to the `options` parameter type.

- [ ] **Step 2: Verify.** Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts` → PASS (existing tests still green; the change is prompt-text only).

- [ ] **Step 3: Typecheck + commit.** Run: `pnpm --filter @contento/ai run typecheck` → PASS.

```bash
git add packages/ai/src/agents/video-storyboard.ts
git commit -m "feat(ai): video-storyboard targets the platform's duration band and hook window

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Campaign create + content-plan fan-out per platform

**Files:** Modify `apps/api/src/routes/campaigns.ts`.

- [ ] **Step 1: Accept `targetPlatforms` on campaign create.** Find the campaign-create body schema (the `z.object` for `POST /campaigns`). Add an optional field validated against the platform set:

```ts
  targetPlatforms: z.array(z.enum(['tiktok', 'instagram', 'youtube', 'telegram'])).min(1).optional(),
```

and in the `prisma.campaign.create({ data: {...} })` call, pass it through when provided:

```ts
        ...(body.targetPlatforms ? { targetPlatforms: body.targetPlatforms } : {}),
```

(If `targetPlatforms` is omitted, the schema default `["tiktok","instagram","youtube","telegram"]` applies.)

- [ ] **Step 2: Fan items across platforms when persisting the plan.** In the `POST /campaigns/:campaignId/content-plan/generate` handler, the `tx.contentPlan.create` currently maps `items.map(item => ({...}))`. Replace that `items: { create: ... }` block so each draft is created once per platform, with `platform` set, and a stable per-(index,platform) ordering:

```ts
          items: {
            create: items.flatMap((item) =>
              campaign.targetPlatforms.map((platform, pIdx) => ({
                index: item.index * campaign.targetPlatforms.length + pIdx,
                topic: item.topic,
                format: item.format,
                platform,
                scheduledDate: new Date(item.scheduledDate),
                hook: item.hook,
              })),
            ),
          },
```

(`campaign` is already loaded in the handler. `targetPlatforms` is now on it. The `index` formula keeps items ordered and unique.)

- [ ] **Step 3: approve handler — pick the platform-matched SocialAccount.** In `PUT /campaigns/:campaignId/items/:itemId/approve`, replace the `socialAccount` lookup with one filtered by the item's platform:

```ts
      const socialAccount = await prisma.socialAccount.findFirst({
        where: { workspaceId, ...(approved.platform ? { platform: approved.platform } : {}) },
        orderBy: { createdAt: 'asc' },
      })
```

(Keep the surrounding `if (approved.scriptId)` / `if (socialAccount)` guards and the `publication.create` from P0 Task 9 unchanged — it already sets `videoJobId: approved.videoJobId`.)

- [ ] **Step 4: Serialize platform (if the item response schema is strict).** If `serializeItem` / `ContentPlanItemResponse` is a Zod response schema, add `platform: z.string().nullable()` to it and include `platform: item.platform` in `serializeItem`. (Check `serializeItem` — if it spreads the row, only the response Zod schema needs the field.)

- [ ] **Step 5: Build + typecheck.** Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/routes/campaigns.ts
git commit -m "feat(api): campaign targetPlatforms + fan content-plan items per platform; approve picks platform-matched account

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: campaign-producer — use item.platform + profile

**Files:** Modify `apps/api/src/jobs/campaign-producer.ts`.

- [ ] **Step 1: writeScript with the item's platform.** Replace the hardcoded `platform: 'instagram'` in the `writeScript(...)` call with `platform: item.platform ?? 'instagram'`:

```ts
          const contentScript = await writeScript(workspaceId, {
            title: item.topic,
            angle: item.hook,
            format: item.format,
            platform: item.platform ?? 'instagram',
          })
```

- [ ] **Step 2: VideoJob carries platform + language stays.** In the `prisma.videoJob.create({ data: {...} })` call, add `platform: item.platform ?? null`:

```ts
        const videoJob = await prisma.videoJob.create({
          data: { workspaceId, scriptId, status: 'PENDING', language: 'ru', aspectRatio: '9:16', platform: item.platform ?? null },
        })
```

- [ ] **Step 3: storyboard gets the platform.** The storyboard runs in the video-worker (`generateVideoStoryboard`), which receives the `language` from the queue payload. Thread `platform` through: in the `getVideoQueue().add('generate', {...})` payload add `platform: item.platform ?? null`; in `apps/video-worker/src/worker.ts` `VideoJobPayload` add `platform?: string | null` and pass it into `generateVideoStoryboard(workspaceId, {...}, { language, ...(characterDescription?{characterDescription}:{}) , ...(platform?{platform}:{}) })`.

(If reading the worker shows `generateVideoStoryboard` options already spread cleanly, just add the `platform` key. Keep all P0 VideoProvider routing unchanged.)

- [ ] **Step 4: Build + typecheck.** Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck && pnpm --filter @contento/video-worker run typecheck` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/jobs/campaign-producer.ts apps/video-worker/src/worker.ts
git commit -m "feat(producer): generate script/storyboard/VideoJob per the item's platform profile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test` → typecheck 21/21; tests green except the known pre-existing `@contento/api` background-worker error.
- [ ] **Step 2:** Trace by reading: campaign create stores `targetPlatforms` → content-plan generate fans items per platform (`item.platform` set) → producer uses `item.platform` in writeScript (caption/length per profile) + VideoJob.platform + storyboard platform → approve picks the SocialAccount matching `item.platform` → P0 chain publishes per platform. Note any gap as a follow-up.

---

## Out of scope (Plan B / later)
- `shotType` multi-format (b-roll generate-scene, screencast) and format-aware `VideoStitch`.
- `formatMix` consumption (the field isn't in the Plan-A profile; storyboard stays avatar-only).
- Per-platform Remotion duration enforcement in the composition (storyboard sets duration; the composition still stitches whatever shots it gets).
- Web UI for `targetPlatforms` selection (API accepts it; UI later).
- Native trending-sound integration for TikTok (`nativeSoundImportance` is advisory only here).

## Risks
- `String[]` default on `Campaign.targetPlatforms` needs Postgres array support (pgvector/pg16 image has it). Live migration requires `db:migrate`; generated client suffices for typecheck/tests.
- Item count multiplies by |targetPlatforms| — content plans get larger; acceptable (each item is a real per-platform deliverable). The producer is serial (concurrency 1) so render cost/time scales linearly — expected.
- `serializeItem` response schema may need the `platform` field (Task 5 Step 4) — verify against the actual Zod response schema.
