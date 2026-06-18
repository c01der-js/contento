# Plan B2: screencast shot type (synthetic screens + uploaded recording) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `screencast` a real third shot type alongside `avatar` and `b-roll`: the storyboard emits screencast shots with a template (`slides` | `chat` | `browser` | `phone-app`) and structured on-screen content; the worker generates only a voiceover for them (no Higgsfield clip) **or** uses an uploaded screen-recording Asset when one exists; and `VideoStitch` renders the synthetic screen inline in Remotion (or the uploaded clip via `<OffthreadVideo>`), with the voiceover + subtitles over it.

**Architecture:** Screencast is the first shot type with **no Higgsfield clip** — the visual is synthesized at stitch time inside Remotion from structured content the storyboard agent generates. A screencast `VideoShot` carries `screencastTemplate` + `screencastContent` (Json). In `handleGenerate` the screencast branch does TTS→`audioUrl` only (no `sceneFrame`/`talkingHead`); it then resolves an optional uploaded recording (`Asset` of new kind `SCREENCAST`) — if present it sets `clipUrl = asset.url` so the shot renders as a normal video clip; if absent `clipUrl` stays null and the synthetic content drives rendering. `VideoStitch.ShotLayer` branches: a screencast shot with no `src` renders `<ScreencastShot template content>` (a dispatcher over 4 synthetic Remotion screens); a screencast shot **with** `src` (uploaded recording) renders `<OffthreadVideo>` like b-roll. The avatar and b-roll paths are unchanged. Builds on Plan B (`shotType`/`headline`/`audioUrl`, `formatMix`, voiceover-driven duration).

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), pnpm + Turborepo, vitest, Prisma (Postgres), Anthropic SDK, Remotion (`@contento/brand-kit`), `@aws-sdk/client-s3`.

---

## Scope (read first)

The user selected **full scope**: all four synthetic templates **and** the uploaded-recording path, in one plan.

**In scope:**
- `AssetKind.SCREENCAST` + `VideoShot.screencastTemplate` / `screencastContent`.
- Zod `ScreencastTemplateSchema` + discriminated `ScreencastContentSchema`; `VideoShotSchema` extension.
- Storyboard distributes screencast shots per `formatMix.screencast` (unfolding the weight Plan B folded into avatar) and generates per-template structured content.
- Four synthetic Remotion screens (`SlidesScreen`, `ChatScreen`, `BrowserScreen`, `PhoneAppScreen`) + a `ScreencastShot` dispatcher.
- `VideoStitch.ShotLayer` screencast branch (synthetic **and** uploaded-recording).
- Worker `handleGenerate` screencast branch (voiceover-only + Asset resolution) and `handleStitch` screencast branch (synthetic props vs uploaded clip).
- `StitchShotProps` / `StitchShotInput` carry the screencast discriminator + content.

**Out of scope (later):**
- Web UI to upload screen recordings / pick a template (the Asset is consumed if present; producing it is manual/seed for now).
- Per-template animation polish beyond simple progressive reveal.
- Asset-to-shot precise matching (MVP: newest `SCREENCAST` asset for the workspace backs any screencast shot that wants a recording).

**Verified current state (post Plan B, from code):**
- `AssetKind` (schema.prisma:57-62) = `BROLL, PRODUCT, REFERENCE, VOICE_SAMPLE` (no SCREENCAST). `Asset` (schema.prisma:860-875) = `{ id, workspaceId, kind, url, thumbnailUrl?, mimeType?, tags[], meta?, createdAt, updatedAt }`.
- `VideoShot` (schema.prisma:942-960) has `shotType String @default("avatar")`, `headline String?`, `audioUrl String?`, `clipUrl String?`. No screencast fields.
- `ShotTypeSchema` (video-storyboard.ts:8) = `z.enum(['avatar','broll','screencast'])` — already includes `screencast`; the prompt currently instructs only avatar/broll and folds screencast weight into avatar (video-storyboard.ts:6-7, 55-60).
- `VideoShotSchema` (video-storyboard.ts:11-18) = `{ index, shotType, prompt, dialogue?, headline?, durationSec }`.
- `VideoStitch.ShotLayer` (VideoStitch.tsx:65-111): builds `const video = <OffthreadVideo src={shot.src} …>`, optionally `<Loop>`-wraps it, then renders `<Audio>`/headline/subtitle `chunks`. `SUBTITLE_FONT='ContentoInter'` (VideoStitch.tsx:14). House style: `<AbsoluteFill>`, `linear-gradient(160deg, primary, secondary)`, `accentColor` bars/labels, `color:'#fff'`, text-shadow `'0 4px 24px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)'`, padding 60-80.
- `StitchShotProps` (video-stitch-shared.ts:15-27) = `{ src, durationInFrames, chunks, audioSrc?, headline?, clipDurationInFrames? }` — `src` is **required**.
- `DEFAULT_VIDEO_STITCH_PROPS` (video-stitch-shared.ts:42-49): `primaryColor '#1a1a2e'`, `secondaryColor '#0d0d1a'`, `accentColor '#e94560'`, `STITCH_FPS` = 30.
- `worker.ts` `handleGenerate`: `createMany` maps storyboard shots (~worker.ts:114-125, persists `shotType`/`headline`); shot loop declares `let clipUrl: string`, `shotAudioUrl`, `effectiveType = shotType === 'broll' ? 'broll' : 'avatar'` (~worker.ts:150-153), branches `if (effectiveType === 'broll') {…} else {…avatar…}`; DONE update writes `{ status:'DONE', clipUrl, …audioUrl }` (~worker.ts:220).
- `worker.ts` `handleStitch` remotion branch loop (~worker.ts:314-334): per shot `if (!shot.clipUrl) throw`; presign `src`; `clipProbedSec = probeDurationSec(src)`; b-roll vs avatar `StitchShotInput`.
- `stitch-props.ts`: `StitchShotInput = { src, probedSec, timing?, audioSrc?, headline?, clipProbedSec? }`; `buildShotProps(src, probedSec, timing?, extra?)`; `buildStitchProps({ shots, cta, visual? })`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/prisma/schema.prisma` | modify | `AssetKind` += `SCREENCAST`; `VideoShot.screencastTemplate String?` + `screencastContent Json?` |
| `packages/ai/src/agents/video-storyboard.ts` | modify | `ScreencastTemplateSchema`, `ScreencastContentSchema` (discriminated union), `VideoShotSchema.screencastContent`; distribute screencast shots per `formatMix.screencast`; prompt rules |
| `packages/ai/src/agents/video-storyboard.test.ts` | modify | screencast distribution + content parsing tests |
| `packages/brand-kit/src/compositions/video-stitch-shared.ts` | modify | `StitchShotProps`: optional `src`, `shotType?`, `screencastTemplate?`, `screencastContent?`; export `ScreencastContent` TS types |
| `packages/brand-kit/src/compositions/screencast/SlidesScreen.tsx` | create | synthetic slides screen |
| `packages/brand-kit/src/compositions/screencast/ChatScreen.tsx` | create | synthetic chat screen |
| `packages/brand-kit/src/compositions/screencast/BrowserScreen.tsx` | create | synthetic browser screen |
| `packages/brand-kit/src/compositions/screencast/PhoneAppScreen.tsx` | create | synthetic phone-app screen |
| `packages/brand-kit/src/compositions/screencast/ScreencastShot.tsx` | create | dispatcher over the 4 screens |
| `packages/brand-kit/src/compositions/VideoStitch.tsx` | modify | `ShotLayer` screencast branch (synthetic vs uploaded clip) |
| `apps/video-worker/scripts/render-smoke.ts` | modify | add one screencast shot per template to the smoke render |
| `apps/video-worker/src/stitch-props.ts` | modify | `StitchShotInput` + `buildScreencastShotProps`; `buildStitchProps` dispatch |
| `apps/video-worker/src/stitch-props.test.ts` | modify | screencast synthetic input → src-less props with content |
| `apps/video-worker/src/worker.ts` | modify | `handleGenerate` screencast branch (TTS-only + Asset resolution); `createMany` persists template/content; `handleStitch` screencast branch |

---

### Task 1: Schema — `AssetKind.SCREENCAST` + `VideoShot` screencast columns

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the asset kind.** In `enum AssetKind` (schema.prisma:57-62), add a value:

```prisma
enum AssetKind {
  BROLL
  PRODUCT
  REFERENCE
  VOICE_SAMPLE
  SCREENCAST
}
```

- [ ] **Step 2: Add the screencast columns to `VideoShot`.** In `model VideoShot` (schema.prisma:942), add after `audioUrl String?`:

```prisma
  screencastTemplate String?         // slides | chat | browser | phone-app (set for synthetic screencast shots)
  screencastContent  Json?           // structured on-screen content for the template
```

(Keep `status`, `higgsfieldJobId`, `clipUrl`, `errorMessage`, the relation and indexes unchanged. `clipUrl` is reused for an uploaded screen-recording.)

- [ ] **Step 3: Regenerate the client and build.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes; `videoShot.screencastTemplate` / `screencastContent` and `AssetKind.SCREENCAST` are typed.

(Live `db:migrate` needs Postgres — part of the deferred project-wide migration debt; the generated client suffices for typecheck/tests.)

- [ ] **Step 4: Typecheck the repo.**

Run: `pnpm typecheck`
Expected: PASS (no consumer references the fields yet).

- [ ] **Step 5: Commit.**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): AssetKind.SCREENCAST + VideoShot.screencastTemplate/screencastContent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared screencast content types in brand-kit

**Files:**
- Modify: `packages/brand-kit/src/compositions/video-stitch-shared.ts`

The Remotion screens are the canonical consumers of the content shape, so the TS types live in brand-kit. `@contento/ai`'s Zod schema (Task 3) validates the **same shape** — keep them in sync (noted as a risk).

- [ ] **Step 1: Add the content types + extend `StitchShotProps`.** In `packages/brand-kit/src/compositions/video-stitch-shared.ts`, add above `StitchShotProps`:

```ts
export type ScreencastTemplate = 'slides' | 'chat' | 'browser' | 'phone-app'

export interface SlidesContent { template: 'slides'; title: string; bullets: string[] }
export interface ChatContent { template: 'chat'; messages: { side: 'left' | 'right'; text: string }[] }
export interface BrowserContent { template: 'browser'; url: string; title: string; lines: string[] }
export interface PhoneAppContent { template: 'phone-app'; appName: string; items: string[] }
export type ScreencastContent = SlidesContent | ChatContent | BrowserContent | PhoneAppContent
```

Then change `StitchShotProps` so `src` is optional and add the screencast discriminator + content:

```ts
export interface StitchShotProps {
  /** Video URL (avatar/b-roll/uploaded-recording). Absent for synthetic screencast shots. */
  src?: string
  /** Shot kind; absent/'video' renders the clip path, 'screencast' renders a synthetic screen. */
  shotType?: 'video' | 'screencast'
  /** Trimmed shot length in frames. */
  durationInFrames: number
  chunks: StitchChunk[]
  /** Voiceover track for non-avatar shots (avatar audio is baked into `src`). */
  audioSrc?: string
  /** On-screen headline for b-roll shots. */
  headline?: string
  /** Natural length of `src` in frames; when set and shorter than durationInFrames, the clip loops. */
  clipDurationInFrames?: number
  /** Synthetic screen template (when shotType==='screencast' and there is no `src`). */
  screencastTemplate?: ScreencastTemplate
  /** Structured content for the synthetic screen. */
  screencastContent?: ScreencastContent
}
```

- [ ] **Step 2: Typecheck brand-kit.**

Run: `pnpm --filter @contento/brand-kit run build`
Expected: PASS — `src` becoming optional must not break existing usage. (If `buildShotProps`/`VideoStitch` reference `shot.src` in a way that now errors on `string | undefined`, that's fixed in Tasks 7-8; for THIS task only the type file changes, and the renderer/worker still build because they always set `src` today. If the brand-kit build flags `shot.src` inside `VideoStitch.tsx` as possibly-undefined, add a `shot.src &&` guard in Task 8 — note it here and proceed; if it blocks the build now, do Task 8's ShotLayer guard as part of this commit.)

> Implementation note: making `src` optional may surface a "possibly undefined" error at the existing `<OffthreadVideo src={shot.src}>` in `VideoStitch.tsx`. If so, minimally guard it now (`src={shot.src!}` is acceptable only inside the existing video branch where `src` is always set, but prefer the explicit branch added in Task 8). Keep this task green: if the build breaks, fold Task 8's branch in and commit together, or add a temporary `shot.src ?? ''` at the OffthreadVideo and replace it in Task 8.

- [ ] **Step 3: Commit.**

```bash
git add packages/brand-kit/src/compositions/video-stitch-shared.ts
git commit -m "feat(brand-kit): screencast content types + StitchShotProps screencast discriminator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Zod schema — `ScreencastContentSchema` + `VideoShotSchema` extension

**Files:**
- Modify: `packages/ai/src/agents/video-storyboard.ts`

- [ ] **Step 1: Add the schemas.** In `packages/ai/src/agents/video-storyboard.ts`, after `ShotTypeSchema` (video-storyboard.ts:8-9), add:

```ts
export const ScreencastTemplateSchema = z.enum(['slides', 'chat', 'browser', 'phone-app'])
export type ScreencastTemplate = z.infer<typeof ScreencastTemplateSchema>

// Structured on-screen content per template. Mirror of @contento/brand-kit's
// ScreencastContent TS types — keep the two in sync (renderer consumes the same shape).
export const ScreencastContentSchema = z.discriminatedUnion('template', [
  z.object({ template: z.literal('slides'), title: z.string().min(1), bullets: z.array(z.string().min(1)).min(1).max(5) }),
  z.object({ template: z.literal('chat'), messages: z.array(z.object({ side: z.enum(['left', 'right']), text: z.string().min(1) })).min(1).max(6) }),
  z.object({ template: z.literal('browser'), url: z.string().min(1), title: z.string().min(1), lines: z.array(z.string().min(1)).min(1).max(4) }),
  z.object({ template: z.literal('phone-app'), appName: z.string().min(1), items: z.array(z.string().min(1)).min(1).max(5) }),
])
export type ScreencastContent = z.infer<typeof ScreencastContentSchema>
```

Then extend `VideoShotSchema` (video-storyboard.ts:11-18) with an optional `screencastContent`:

```ts
export const VideoShotSchema = z.object({
  index: z.number().int().min(0),
  shotType: ShotTypeSchema.default('avatar'),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  headline: z.string().optional(),
  screencastContent: ScreencastContentSchema.optional(), // required-ish for screencast (enforced in the prompt)
  durationSec: z.number().positive(),
})
```

- [ ] **Step 2: Write a parse test.** In `packages/ai/src/agents/video-storyboard.test.ts`, add a unit test for the schema (import `VideoShotSchema` is already used; if not, import it):

```ts
  it('parses a screencast shot with discriminated content (slides)', () => {
    const parsed = VideoShotSchema.parse({
      index: 1, shotType: 'screencast', prompt: 'slides screen', dialogue: 'три причины',
      screencastContent: { template: 'slides', title: 'Три причины', bullets: ['Раз', 'Два', 'Три'] },
      durationSec: 5,
    })
    expect(parsed.shotType).toBe('screencast')
    expect(parsed.screencastContent?.template).toBe('slides')
  })
  it('rejects screencast content with the wrong shape for its template', () => {
    const r = VideoShotSchema.safeParse({
      index: 1, shotType: 'screencast', prompt: 'x', durationSec: 5,
      screencastContent: { template: 'chat', title: 'nope' }, // chat needs messages, not title
    })
    expect(r.success).toBe(false)
  })
```

(If `VideoShotSchema` isn't imported in the test file, add it to the existing import from `./video-storyboard.js`.)

- [ ] **Step 3: Run it, verify pass.**

Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 4: Typecheck + commit.**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/agents/video-storyboard.ts packages/ai/src/agents/video-storyboard.test.ts
git commit -m "feat(ai): ScreencastContentSchema (discriminated) + VideoShotSchema.screencastContent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `SlidesScreen` synthetic component

**Files:**
- Create: `packages/brand-kit/src/compositions/screencast/SlidesScreen.tsx`

- [ ] **Step 1: Create the component.** It renders a title + progressively-revealed bullets, in the house style. `packages/brand-kit/src/compositions/screencast/SlidesScreen.tsx`:

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { SlidesContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function SlidesScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: SlidesContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  // Reveal one bullet roughly every 18 frames (~0.6s at 30fps).
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: FONT,
        color: '#fff',
        padding: 96,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 140, height: 10, background: accentColor, borderRadius: 4, marginBottom: 40 }} />
      <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.1, marginBottom: 56 }}>{content.title}</div>
      {content.bullets.map((b, i) => {
        const appear = interpolate(frame, [18 * i, 18 * i + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <div
            key={i}
            style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.4, marginBottom: 28, opacity: appear, transform: `translateX(${(1 - appear) * 40}px)`, display: 'flex', gap: 24 }}
          >
            <span style={{ color: accentColor }}>{'•'}</span>
            <span>{b}</span>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/brand-kit run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/brand-kit/src/compositions/screencast/SlidesScreen.tsx
git commit -m "feat(brand-kit): SlidesScreen synthetic screencast template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `ChatScreen` synthetic component

**Files:**
- Create: `packages/brand-kit/src/compositions/screencast/ChatScreen.tsx`

- [ ] **Step 1: Create the component.** Messenger-style bubbles appearing sequentially. `packages/brand-kit/src/compositions/screencast/ChatScreen.tsx`:

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { ChatContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function ChatScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: ChatContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: FONT,
        color: '#fff',
        padding: 80,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 28,
      }}
    >
      {content.messages.map((m, i) => {
        const appear = interpolate(frame, [20 * i, 20 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const mine = m.side === 'right'
        return (
          <div
            key={i}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              background: mine ? accentColor : 'rgba(255,255,255,0.14)',
              color: '#fff',
              fontSize: 46,
              lineHeight: 1.3,
              padding: '28px 36px',
              borderRadius: 36,
              borderBottomRightRadius: mine ? 8 : 36,
              borderBottomLeftRadius: mine ? 36 : 8,
              opacity: appear,
              transform: `translateY(${(1 - appear) * 24}px)`,
            }}
          >
            {m.text}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/brand-kit run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/brand-kit/src/compositions/screencast/ChatScreen.tsx
git commit -m "feat(brand-kit): ChatScreen synthetic screencast template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `BrowserScreen` synthetic component

**Files:**
- Create: `packages/brand-kit/src/compositions/screencast/BrowserScreen.tsx`

- [ ] **Step 1: Create the component.** A browser chrome (URL bar) + a simple article. `packages/brand-kit/src/compositions/screencast/BrowserScreen.tsx`:

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { BrowserContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function BrowserScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: BrowserContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`, fontFamily: FONT, padding: 64, justifyContent: 'center' }}>
      <div style={{ background: '#fff', color: '#111', borderRadius: 28, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {/* Chrome bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '28px 32px', background: '#ececf0' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#ff5f57' }} />
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#febc2e' }} />
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#28c840' }} />
          <div style={{ flex: 1, marginLeft: 20, background: '#fff', borderRadius: 18, padding: '16px 28px', fontSize: 34, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {content.url}
          </div>
        </div>
        {/* Page */}
        <div style={{ padding: 56 }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, marginBottom: 40, color: '#111' }}>{content.title}</div>
          <div style={{ width: 120, height: 8, background: accentColor, borderRadius: 4, marginBottom: 40 }} />
          {content.lines.map((l, i) => {
            const appear = interpolate(frame, [16 * i, 16 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return (
              <div key={i} style={{ fontSize: 42, lineHeight: 1.5, color: '#333', marginBottom: 22, opacity: appear }}>
                {l}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/brand-kit run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/brand-kit/src/compositions/screencast/BrowserScreen.tsx
git commit -m "feat(brand-kit): BrowserScreen synthetic screencast template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `PhoneAppScreen` synthetic component

**Files:**
- Create: `packages/brand-kit/src/compositions/screencast/PhoneAppScreen.tsx`

- [ ] **Step 1: Create the component.** A phone frame with an app header + a feed/list of items. `packages/brand-kit/src/compositions/screencast/PhoneAppScreen.tsx`:

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { PhoneAppContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function PhoneAppScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: PhoneAppContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`, fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 760, height: 1480, background: '#0f0f14', borderRadius: 72, border: '12px solid #2a2a33', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* App header */}
        <div style={{ background: accentColor, color: '#fff', padding: '56px 40px 32px', fontSize: 48, fontWeight: 800 }}>{content.appName}</div>
        {/* Feed */}
        <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {content.items.map((it, i) => {
            const appear = interpolate(frame, [18 * i, 18 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 28, padding: 36, fontSize: 42, color: '#fff', lineHeight: 1.3, opacity: appear, transform: `translateY(${(1 - appear) * 24}px)`, display: 'flex', gap: 24, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: accentColor, flexShrink: 0 }} />
                <span>{it}</span>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/brand-kit run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/brand-kit/src/compositions/screencast/PhoneAppScreen.tsx
git commit -m "feat(brand-kit): PhoneAppScreen synthetic screencast template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `ScreencastShot` dispatcher + `VideoStitch.ShotLayer` branch

**Files:**
- Create: `packages/brand-kit/src/compositions/screencast/ScreencastShot.tsx`
- Modify: `packages/brand-kit/src/compositions/VideoStitch.tsx`
- Modify: `apps/video-worker/scripts/render-smoke.ts`

- [ ] **Step 1: Create the dispatcher.** It selects a screen by `content.template` and falls back to slides for an unknown value. `packages/brand-kit/src/compositions/screencast/ScreencastShot.tsx`:

```tsx
import type { ScreencastContent } from '../video-stitch-shared.js'
import { SlidesScreen } from './SlidesScreen.js'
import { ChatScreen } from './ChatScreen.js'
import { BrowserScreen } from './BrowserScreen.js'
import { PhoneAppScreen } from './PhoneAppScreen.js'

export function ScreencastShot({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: ScreencastContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const colors = { primaryColor, secondaryColor, accentColor }
  switch (content.template) {
    case 'chat':
      return <ChatScreen content={content} {...colors} />
    case 'browser':
      return <BrowserScreen content={content} {...colors} />
    case 'phone-app':
      return <PhoneAppScreen content={content} {...colors} />
    case 'slides':
    default:
      return <SlidesScreen content={content} {...colors} />
  }
}
```

- [ ] **Step 2: Branch `ShotLayer`.** In `packages/brand-kit/src/compositions/VideoStitch.tsx`, import the dispatcher and the colors. `ShotLayer` currently receives only `accentColor`; it needs `primaryColor`/`secondaryColor` for synthetic screens. Change the call site in `VideoStitch` (the `<ShotLayer shot={shot} accentColor={props.accentColor} />`) to pass all three:

```tsx
        <ShotLayer
          shot={shot}
          primaryColor={props.primaryColor}
          secondaryColor={props.secondaryColor}
          accentColor={props.accentColor}
        />
```

Update `ShotLayer`'s signature and add the screencast branch at the top of its body (before the `const video = …`). The synthetic branch renders `<ScreencastShot>` instead of `<OffthreadVideo>`, with the SAME audio + headline + subtitle overlays:

```tsx
import { ScreencastShot } from './screencast/ScreencastShot.js'

function ShotLayer({
  shot,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  shot: StitchShotProps
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()

  // SYNTHETIC SCREENCAST: no clip; render the screen from structured content.
  if (shot.shotType === 'screencast' && !shot.src && shot.screencastContent) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <ScreencastShot content={shot.screencastContent} primaryColor={primaryColor} secondaryColor={secondaryColor} accentColor={accentColor} />
        {/* Avatar clips bake audio in; screencast/b-roll carry audioSrc — no double track. */}
        {shot.audioSrc && <Audio src={shot.audioSrc} />}
        {shot.chunks.map((c, i) => (
          <Sequence key={i} from={c.startFrame} durationInFrames={Math.max(1, c.endFrame - c.startFrame)}>
            <SubtitleChunkView chunk={c} accentColor={accentColor} />
          </Sequence>
        ))}
      </AbsoluteFill>
    )
  }

  // VIDEO (avatar / b-roll / uploaded-recording screencast): unchanged clip path.
  // Subtle Ken Burns zoom so static avatar shots don't feel frozen; also applies to looped b-roll.
  const scale = interpolate(frame, [0, Math.max(1, shot.durationInFrames)], [1, 1.04])
  const video = (
    <OffthreadVideo
      src={shot.src!}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
    />
  )
  return (
    // …existing return body verbatim (Loop/Audio/headline/chunks)…
  )
}
```

(Keep the existing video-branch return EXACTLY as it is today — only `src` becomes `shot.src!` since the synthetic case returned early and the video branch always has `src`. The headline overlay stays only in the video branch; synthetic screens carry their own title, so no separate `headline` overlay is rendered for them. An uploaded-recording screencast has `shot.src` set + `shot.shotType==='screencast'`, so it skips the synthetic branch and renders as a normal clip.)

- [ ] **Step 3: Extend the smoke render.** In `apps/video-worker/scripts/render-smoke.ts`, add four synthetic screencast shots (one per template) to the sample `shots`, each with `shotType:'screencast'`, NO `src`, an `audioSrc` pointing at the same mock URL the script already uses, a `screencastContent`, and a `durationInFrames`. Example shot objects:

```ts
  { shotType: 'screencast', durationInFrames: 120, chunks: [], audioSrc: SAMPLE_AUDIO,
    screencastContent: { template: 'slides', title: 'Три причины', bullets: ['Скорость', 'Цена', 'Качество'] } },
  { shotType: 'screencast', durationInFrames: 120, chunks: [], audioSrc: SAMPLE_AUDIO,
    screencastContent: { template: 'chat', messages: [ { side: 'left', text: 'Это работает?' }, { side: 'right', text: 'Да, смотри' } ] } },
  { shotType: 'screencast', durationInFrames: 120, chunks: [], audioSrc: SAMPLE_AUDIO,
    screencastContent: { template: 'browser', url: 'contento.app', title: 'Как это устроено', lines: ['Шаг первый', 'Шаг второй'] } },
  { shotType: 'screencast', durationInFrames: 120, chunks: [], audioSrc: SAMPLE_AUDIO,
    screencastContent: { template: 'phone-app', appName: 'Contento', items: ['Новый тренд', 'Готовый сценарий'] } },
```

(Use the script's existing sample-audio constant for `SAMPLE_AUDIO`; if the script builds props via `buildStitchProps`, instead add the equivalent `StitchShotInput`s — but the simplest path is to construct `VideoStitchProps.shots` directly for the smoke. Match whatever the existing smoke script does.)

- [ ] **Step 4: Build + smoke render.**

Run: `pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker exec tsx scripts/render-smoke.ts`
Expected: renders a 1080×1920 MP4 without throwing; the four screencast segments show each synthetic screen with the voiceover. If headless Chromium/ffmpeg is unavailable locally (environment), capture the error and still verify via typecheck — report DONE_WITH_CONCERNS.

- [ ] **Step 5: Typecheck.**

Run: `pnpm --filter @contento/brand-kit run typecheck && pnpm --filter @contento/video-worker run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/brand-kit/src/compositions/screencast/ScreencastShot.tsx packages/brand-kit/src/compositions/VideoStitch.tsx apps/video-worker/scripts/render-smoke.ts
git commit -m "feat(brand-kit): ScreencastShot dispatcher + VideoStitch synthetic-screen branch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: storyboard — distribute screencast shots + generate content

**Files:**
- Modify: `packages/ai/src/agents/video-storyboard.ts`
- Modify: `packages/ai/src/agents/video-storyboard.test.ts`

- [ ] **Step 1: Write the failing test.** In `packages/ai/src/agents/video-storyboard.test.ts`, add (matching the existing `mockCreate` harness):

```ts
  it('instructs a screencast quota and parses screencast shots with content', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { index: 0, shotType: 'avatar', prompt: 'host', dialogue: 'Привет', durationSec: 3 },
        { index: 1, shotType: 'screencast', prompt: 'slides', dialogue: 'три причины',
          screencastContent: { template: 'slides', title: 'Три причины', bullets: ['А', 'Б'] }, durationSec: 5 },
        { index: 2, shotType: 'avatar', prompt: 'host', dialogue: 'Пока', durationSec: 3 },
      ]) }],
    })
    const shots = await generateVideoStoryboard('ws1', { hook: 'h', body: 'b', cta: 'c' }, { shotCount: 5, platform: 'telegram' })
    const systemText = mockCreate.mock.calls.at(-1)![0].system.map((s: { text: string }) => s.text).join('\n')
    expect(systemText).toContain('screencast')
    expect(shots[1]!.shotType).toBe('screencast')
    expect(shots[1]!.screencastContent?.template).toBe('slides')
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts -t "screencast quota"`
Expected: FAIL — the prompt has no screencast instruction.

- [ ] **Step 3: Implement the distribution.** In `generateVideoStoryboard`, replace the Plan B `brollCount`/`formatLine` block (video-storyboard.ts:55-60) with one that also computes a screencast quota (unfolding the screencast weight):

```ts
  // Plan B2: split shots into avatar / b-roll / screencast by the platform's formatMix.
  const brollCount = profile ? Math.round(profile.formatMix.broll * shotCount) : 0
  const screencastCount = profile ? Math.round(profile.formatMix.screencast * shotCount) : 0
  // Never let non-avatar shots take the first/last slot, and keep >=1 avatar slot for hook+CTA.
  const maxNonAvatar = Math.max(0, shotCount - 2)
  const nonAvatar = Math.min(brollCount + screencastCount, maxNonAvatar)
  const broll = Math.min(brollCount, nonAvatar)
  const screencast = Math.min(screencastCount, nonAvatar - broll)
  const formatLine =
    broll + screencast > 0
      ? `Of the ${shotCount} shots, make exactly ${broll} "broll" and ${screencast} "screencast"; the rest are "avatar". Never put a broll or screencast shot first or last.`
      : 'Every shot is an "avatar" shot.'
```

Then update the JSON field list + rules in the `system` array (video-storyboard.ts:74-94). Replace the `shotType` line and add screencast guidance + a `screencastContent` field description:

```ts
          '  shotType   — "avatar", "broll", or "screencast"',
          '  prompt     — visual description (max 30 words). avatar: the person speaking. broll: a scene with NO people/faces. screencast: name the synthetic screen to show.',
          '  dialogue   — the spoken voiceover for this shot (direct quote from the script)',
          '  headline   — REQUIRED for broll: 2–6 words of on-screen text; omit for avatar/screencast',
          '  screencastContent — REQUIRED for screencast only. One JSON object, pick ONE template:',
          '      slides:    { "template":"slides", "title": string, "bullets": string[1..5] }',
          '      chat:      { "template":"chat", "messages": [{ "side":"left"|"right", "text": string }] (1..6) }',
          '      browser:   { "template":"browser", "url": string, "title": string, "lines": string[1..4] }',
          '      phone-app: { "template":"phone-app", "appName": string, "items": string[1..5] }',
          '  durationSec — float (typically 1.5–5)',
          'Rules:',
          '  - First shot is the hook (avatar); last shot is the CTA / ending (avatar)',
          '  - ' + formatLine,
          '  - ' + durationLine,
          '  - broll keeps the voiceover in `dialogue`, shows no person, puts a punchy phrase in `headline`',
          '  - screencast keeps the voiceover in `dialogue`; all on-screen words go in `screencastContent` (Russian, short)',
          '  - dialogue must come directly from the provided script text',
          'Respond with valid JSON array only. No markdown fences. No extra text.',
```

(Remove the old single `shotType   — "avatar" or "broll"` line and the old `prompt`/`headline` lines being replaced. Keep `systemBlock`, `characterHint`, `languageDirective`, `shotCount`.)

- [ ] **Step 3b: Remove now-stale Plan-B comments.** Screencast is real now, so delete the two obsolete comments that say it is folded into avatar:
  - The `ShotTypeSchema` comment (video-storyboard.ts:6-7): `// 'screencast' is a valid value but is treated as 'avatar' until Plan B2 ships the // synthetic-screen renderer (the storyboard prompt only instructs avatar/broll).` — delete it.
  - The Plan B distribution comment that read `// screencast weight folds into avatar until Plan B2 ships the synthetic renderer.` — already replaced by the new `// Plan B2: split shots into avatar / b-roll / screencast …` comment in Step 3.

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts`
Expected: PASS (existing + new). The schema's `screencastContent` is optional, so avatar/b-roll shots still parse.

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/agents/video-storyboard.ts packages/ai/src/agents/video-storyboard.test.ts
git commit -m "feat(ai): video-storyboard distributes screencast shots + generates per-template content

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: worker `handleGenerate` — screencast branch (voiceover-only + Asset)

**Files:**
- Modify: `apps/video-worker/src/worker.ts`

**Context:** Screencast shots have no Higgsfield clip. The branch generates the voiceover (TTS→our S3 mp3→`audioUrl`), then resolves an optional uploaded recording (`Asset` kind `SCREENCAST`): if found, `clipUrl = asset.url` (rendered as a normal clip later); if not, `clipUrl` stays null and the synthetic content drives rendering. The `createMany` must persist `screencastTemplate`/`screencastContent`.

- [ ] **Step 1: Persist screencast fields in `createMany`.** In the `prisma.videoShot.createMany` mapping (worker.ts ~114-125), add after the `headline` spread:

```ts
        ...(s.screencastContent ? { screencastTemplate: s.screencastContent.template, screencastContent: s.screencastContent } : {}),
```

- [ ] **Step 2: Allow a null `clipUrl`.** Change the loop's `let clipUrl: string` declaration to `let clipUrl: string | null = null`, and make `effectiveType` three-way:

```ts
    let clipUrl: string | null = null
    let shotAudioUrl: string | null = null
    const shotType = shot.shotType ?? 'avatar'
    const effectiveType = shotType === 'broll' ? 'broll' : shotType === 'screencast' ? 'screencast' : 'avatar'
```

(The mock branch still sets `clipUrl = MOCK_CLIP_URL`. For screencast in mock mode, leaving `clipUrl = MOCK_CLIP_URL` is fine — it renders as a clip; the synthetic path is exercised in the smoke render, not the mock unit test.)

- [ ] **Step 3: Add the screencast arm.** In the non-mock generation, add a `screencast` branch alongside `broll`/avatar:

```ts
        if (effectiveType === 'screencast') {
          // No Higgsfield clip: synth screen is rendered at stitch time. Generate voiceover only.
          if (shot.dialogue) {
            const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
            const audioSec = wavDurationSec(await transcodeMp3ToWav(tts.audio))
            const audioKey = `videos/shots/${videoJobId}/${shot.id}.mp3`
            shotAudioUrl = await uploadBuffer(tts.audio, audioKey, 'audio/mpeg')
            shotTimings.push({ index: shot.index, audioSec, words: tts.words })
          }
          // Optional uploaded screen recording: newest SCREENCAST asset backs the shot as a real clip.
          const recording = await prisma.asset.findFirst({
            where: { workspaceId, kind: 'SCREENCAST' },
            orderBy: { createdAt: 'desc' },
          })
          clipUrl = recording?.url ?? null // null => synthetic screen rendered from screencastContent
        } else if (effectiveType === 'broll') {
          // …existing b-roll branch verbatim…
        } else {
          // …existing avatar branch verbatim…
        }
```

(Keep the existing `broll` and avatar branches byte-for-byte; only add the `screencast` arm before them. `workspaceId`, `voiceId`, `shotTimings`, `prisma` are in scope.)

- [ ] **Step 4: DONE update tolerates null `clipUrl`.** The DONE update (worker.ts ~220) currently writes `clipUrl`. With `clipUrl: string | null`, a synthetic screencast shot writes `clipUrl: null` — that is intended (the shot is DONE with no clip). Confirm the update is:

```ts
        await prisma.videoShot.update({
          where: { id: shot.id },
          data: { status: 'DONE', clipUrl, ...(shotAudioUrl ? { audioUrl: shotAudioUrl } : {}) },
        })
```

(`clipUrl` Prisma column is `String?`, so writing `null` is valid.)

- [ ] **Step 5: Build + typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/video-worker run typecheck && pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS (mock-mode generate tests unaffected; screencast branch only runs non-mock).

- [ ] **Step 6: Commit.**

```bash
git add apps/video-worker/src/worker.ts
git commit -m "feat(video-worker): screencast generate branch (voiceover-only + optional uploaded recording)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: stitch-props — synthetic screencast input → src-less props

**Files:**
- Modify: `apps/video-worker/src/stitch-props.ts`
- Modify: `apps/video-worker/src/stitch-props.test.ts`

- [ ] **Step 1: Write the failing test.** In `apps/video-worker/src/stitch-props.test.ts`, add:

```ts
  it('synthetic screencast input yields a src-less prop carrying template content', () => {
    const props = buildStitchProps({
      shots: [{
        screencast: { template: 'slides', title: 'Т', bullets: ['а', 'б'] },
        probedSec: 5, audioSrc: 'https://x/vo.mp3',
        timing: { index: 0, audioSec: 5, words: [{ text: 'а', startSec: 0, endSec: 1 }] },
      }],
      cta: 'Подпишись',
    })
    const shot = props.shots[0]!
    expect(shot.src).toBeUndefined()
    expect(shot.shotType).toBe('screencast')
    expect(shot.screencastContent?.template).toBe('slides')
    expect(shot.audioSrc).toBe('https://x/vo.mp3')
    expect(shot.durationInFrames).toBe(Math.round(5 * 30))
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/video-worker exec vitest run src/stitch-props.test.ts -t "synthetic screencast"`
Expected: FAIL — `StitchShotInput` has no `screencast`; `buildStitchProps` can't build a src-less shot.

- [ ] **Step 3: Implement.** In `apps/video-worker/src/stitch-props.ts`:

3a. Import the content type and extend `StitchShotInput` to be a union of a video input (as today) and a synthetic-screencast input:

```ts
import type { ScreencastContent } from '@contento/brand-kit'

export interface VideoStitchShotInput {
  src: string
  probedSec: number
  timing?: ShotTimingJson
  audioSrc?: string
  headline?: string
  clipProbedSec?: number
}

export interface ScreencastStitchShotInput {
  screencast: ScreencastContent
  /** Voiceover length in seconds — drives the shot duration. */
  probedSec: number
  audioSrc?: string
  timing?: ShotTimingJson
}

export type StitchShotInput = VideoStitchShotInput | ScreencastStitchShotInput
```

(If `@contento/brand-kit` doesn't re-export `ScreencastContent` from its package root, add it to brand-kit's index/barrel export as part of this task, or import from the deep path `@contento/brand-kit/...` matching how `StitchShotProps`/`VideoStitchProps` are currently imported in this file — match the existing import style.)

3b. Add a builder for the synthetic case and dispatch in `buildStitchProps`:

```ts
export function buildScreencastShotProps(input: ScreencastStitchShotInput): StitchShotProps {
  const probed = buildShotProps('', input.probedSec, input.timing) // reuse duration/words/chunks math
  return {
    shotType: 'screencast',
    durationInFrames: probed.durationInFrames,
    chunks: probed.chunks,
    screencastTemplate: input.screencast.template,
    screencastContent: input.screencast,
    ...(input.audioSrc ? { audioSrc: input.audioSrc } : {}),
  }
}
```

In `buildStitchProps`, map each input by kind:

```ts
    shots: input.shots.map((s) =>
      'screencast' in s
        ? buildScreencastShotProps(s)
        : buildShotProps(s.src, s.probedSec, s.timing, {
            ...(s.audioSrc ? { audioSrc: s.audioSrc } : {}),
            ...(s.headline ? { headline: s.headline } : {}),
            ...(s.clipProbedSec != null ? { clipProbedSec: s.clipProbedSec } : {}),
          }),
    ),
```

(Note: `buildShotProps('', …)` is called only to reuse the duration/words/chunks computation — the `src: ''` it returns is dropped, since `buildScreencastShotProps` builds a fresh object WITHOUT `src`. Confirm `buildShotProps` doesn't choke on an empty `src` — it only uses `src` to set the return's `src` field, which we ignore. If `buildShotProps` validates `src`, instead inline the small duration/chunks computation. Verify against the actual `buildShotProps`.)

- [ ] **Step 4: Run it, verify it passes.**

Run: `pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker exec vitest run src/stitch-props.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm --filter @contento/video-worker run typecheck`
Expected: PASS.

```bash
git add apps/video-worker/src/stitch-props.ts apps/video-worker/src/stitch-props.test.ts packages/brand-kit 2>/dev/null || git add apps/video-worker/src/stitch-props.ts apps/video-worker/src/stitch-props.test.ts
git commit -m "feat(video-worker): stitch props for synthetic screencast shots (src-less + content)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: worker `handleStitch` — screencast branch

**Files:**
- Modify: `apps/video-worker/src/worker.ts`

**Context:** `handleStitch` currently throws `if (!shot.clipUrl)`. A synthetic screencast shot has no `clipUrl` — it must build a `ScreencastStitchShotInput` instead. An uploaded-recording screencast (has `clipUrl`) flows through the existing clip path.

- [ ] **Step 1: Branch the shot-input loop.** In the `if (stitcher === 'remotion')` loop (worker.ts ~314-334), handle the synthetic screencast case before the `if (!shot.clipUrl) throw`:

```ts
      for (const shot of shots) {
        const timing = subtitles?.shots.find((s) => s.index === shot.index)
        // SYNTHETIC SCREENCAST: no clip; build a src-less input from the stored content.
        if (shot.shotType === 'screencast' && !shot.clipUrl) {
          if (!shot.screencastContent) throw new Error(`Screencast shot ${shot.id} has no content`)
          const audioSrc = shot.audioUrl
            ? (isOwnS3Url(shot.audioUrl) ? await presignGetUrl(keyFromUrl(shot.audioUrl)) : shot.audioUrl)
            : undefined
          const voiceSec = timing?.audioSec ?? 3
          shotInputs.push({
            screencast: shot.screencastContent as ScreencastContent,
            probedSec: voiceSec,
            ...(audioSrc ? { audioSrc } : {}),
            ...(timing ? { timing } : {}),
          })
          continue
        }
        // VIDEO (avatar / b-roll / uploaded-recording): unchanged.
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        const src = isOwnS3Url(shot.clipUrl) ? await presignGetUrl(keyFromUrl(shot.clipUrl)) : shot.clipUrl
        const clipProbedSec = await probeDurationSec(src)
        if (shot.audioUrl) {
          // …existing b-roll input branch verbatim…
        } else {
          // …existing avatar input branch verbatim…
        }
      }
```

(Import `ScreencastContent` type where the other `@contento/brand-kit`/stitch-props types are imported in worker.ts. `shot.screencastContent` is Prisma `Json`, cast to `ScreencastContent` — the storyboard validated it. Keep the b-roll/avatar branches byte-for-byte. `presignGetUrl`, `keyFromUrl`, `isOwnS3Url`, `probeDurationSec`, `subtitles`, `shotInputs` are in scope.)

- [ ] **Step 2: Build + typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker run typecheck && pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add apps/video-worker/src/worker.ts
git commit -m "feat(video-worker): handleStitch builds synthetic screencast inputs (no clip required)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Full verification

- [ ] **Step 1: Repo-wide typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test`
Expected: typecheck 21/21; tests green except the known pre-existing `@contento/api` background-worker Prisma error (documented; out of scope).

- [ ] **Step 2: Smoke render with screencast.**

Run: `pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker exec tsx scripts/render-smoke.ts`
Expected: renders a 1080×1920 MP4 with the four synthetic screencast segments (if Chromium/ffmpeg present locally). Otherwise note environment-skip.

- [ ] **Step 3: Trace the data path by reading.** Confirm: `formatMix.screencast` → storyboard emits `screencast` shots with `screencastContent` → `createMany` persists `screencastTemplate`/`screencastContent` → `handleGenerate` screencast branch generates voiceover (`audioUrl`), leaves `clipUrl` null (or sets it from a `SCREENCAST` Asset) → `handleStitch` builds a src-less `ScreencastStitchShotInput` (synthetic) or a clip input (uploaded) → `buildScreencastShotProps` → `VideoStitch.ShotLayer` renders `<ScreencastShot>` (synthetic) or `<OffthreadVideo>` (uploaded) + `<Audio>` + subtitles. Avatar and b-roll shots are unchanged end-to-end. Note any gap as a follow-up.

---

## Out of scope (later)
- **Web UI**: upload screen recordings (create `SCREENCAST` Assets), pick/preview templates, choose target platforms.
- **Asset-to-shot matching**: MVP uses the newest workspace `SCREENCAST` asset for any recording-backed screencast shot; precise per-shot asset selection is later.
- **Richer screen animations** (typing cursors, scroll, app transitions) beyond progressive reveal.
- **`formatMix` retuning** now that screencast is real (current weights from Plan A research stand).

## Risks / decisions surfaced
- **Type duplication**: `ScreencastContent` exists as TS in brand-kit AND as a Zod union in `@contento/ai`. They must stay structurally identical — the worker casts Prisma `Json` to the brand-kit type. A shared `@contento/shared` home would remove the duplication; deferred to avoid a new cross-package dependency mid-feature. Document the sync point in both files.
- **`buildShotProps('', …)` reuse** in `buildScreencastShotProps` depends on `buildShotProps` not validating `src`. Verify against the real function; inline the duration/chunks math if it does.
- **`src` made optional on `StitchShotProps`** could surface "possibly undefined" at the existing `<OffthreadVideo>`; the Task 8 early-return for synthetic screencast guarantees the video branch always has `src` (`shot.src!`).
- **Uploaded-recording duration**: an uploaded recording renders as a normal clip and loops to the voiceover length via the existing b-roll loop machinery only if `clipProbedSec` is threaded — for an uploaded screencast (`shot.audioUrl` set + `shot.clipUrl` set) the existing b-roll input branch already handles voiceover-driven duration + loop, so uploaded recordings get the same treatment. No extra work.
- **Storyboard adherence**: the model may emit malformed `screencastContent`; the Zod discriminated union rejects bad shapes at parse time (the whole storyboard parse fails and is retried/surfaced), preventing a half-built screencast shot.
- **Migration debt**: Task 1 adds columns/enum via the generated client; the SQL migration is part of the deferred project-wide migration debt.
