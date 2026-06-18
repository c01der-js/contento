# Plan B: shotType infrastructure + b-roll multi-format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each video a mix of shot types instead of one all-avatar clip: introduce a typed `shotType` (`avatar` | `broll` | `screencast`) end-to-end, distribute shots per the platform's `formatMix`, and fully implement the **b-roll** path (Higgsfield foundation text2image → DoP motion → silent clip, with voiceover played as a separate Remotion audio track + an on-screen headline). Avatar stays exactly as today.

**Architecture:** A new `formatMix` weight set on `PlatformProfile` drives `video-storyboard`, which now tags each shot with `shotType` and (for b-roll) a `headline` + a visual-only `prompt`. The worker branches per `shotType`: **avatar** = current Soul→Speak/DoP path (audio baked into the clip); **broll** = `provider.sceneFrame()` (foundation text2image, **no Soul**) → `provider.motionFromImage()` (silent DoP) → MP4, plus the shot's TTS voiceover uploaded to our S3 so Remotion can play it over the silent visual. `VideoStitch` becomes audio-and-headline aware: a shot with `audioSrc` gets an `<Audio>` track and (for b-roll) a headline overlay; the b-roll clip loops to fill the voiceover duration. **screencast** is forward-declared in the type/schema but renders via the avatar fallback in this plan — the synthetic-screen renderer is **Plan B2** (see Scope).

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), pnpm + Turborepo, vitest, Prisma (Postgres), Anthropic SDK, Remotion (`@contento/brand-kit`), `@aws-sdk/client-s3`.

---

## Scope & split (read first)

The design doc `docs/superpowers/specs/2026-06-15-platformprofile-multiformat-design.md` defines Plan B as **b-roll + screencast**. Per the writing-plans scope check, screencast is a separate subsystem (4 synthetic Remotion UI components — `phone-app`/`browser`/`chat`/`slides` — plus an uploaded-recording path, none of which exist today). Bundling it would double the plan and gate the shippable b-roll win behind UI-component work.

- **This plan (Plan B):** `shotType` infrastructure (profile `formatMix`, schema, Zod, storyboard distribution) + **b-roll fully** + format-aware `VideoStitch` (audio track + headline + clip loop). Ships "avatar + b-roll, per-platform mix."
- **Plan B2 (follow-on, not here):** `screencast` synthetic renderer (`<ScreencastShot>` with `slides`/`chat`/`browser`/`phone-app` templates) + uploaded-recording from the Asset library. Built on this plan's `shotType` infra. The `'screencast'` enum value exists after this plan; the worker maps it to the avatar path until B2 lands (design's documented fallback: `screencast → available type`).

**Verified current state (post-Plan A, from code):**
- `VideoShot` (schema.prisma:942) = `id, videoJobId, index, prompt, dialogue?, durationSec, status, higgsfieldJobId?, clipUrl?, errorMessage`. **No `shotType`/`headline`/`audioUrl`.** Enum `VideoShotStatus` = PENDING/SUBMITTED/DONE/FAILED.
- Zod `VideoShotSchema` (video-storyboard.ts:6) = `{ index, prompt, dialogue?, durationSec }`. `generateVideoStoryboard` returns `VideoShot[]` (validated `z.array(VideoShotSchema)`).
- `generateVideoStoryboard(workspaceId, script, options?: { shotCount?; characterDescription?; language?; platform? })` already imports `getPlatformProfile` and uses it for the duration line.
- `PlatformProfile` (platform-profiles.ts:6) has **no `formatMix`**.
- `VideoProvider` (video-provider.ts) = `uploadAudio, characterFrame, talkingHead, motionFromImage`. **No `sceneFrame`.**
- `client.ts` has `generateCharacterPortrait(description, style, gender)` calling `hfGenerate('/v1/text2image/foundation', {...})` — **the no-Soul foundation text2image path already works**; we add a generic `submitFoundationImage`.
- `worker.ts` `handleGenerate` (worker.ts:80) shot loop: mock branch sets `clipUrl = MOCK_CLIP_URL`; non-mock does TTS→`provider.uploadAudio`→`provider.characterFrame`→`talkingHead|motionFromImage`→fetch→`uploadBuffer(clipBuf, 'videos/shots/${videoJobId}/${shot.id}.mp4', 'video/mp4')`. `VideoJobPayload` carries `platform?`.
- `VideoStitch` (brand-kit) `StitchShotProps = { src; durationInFrames; chunks }`; `ShotLayer` renders `<OffthreadVideo src>` + subtitle `Sequence`s. **No audio track, no headline, no per-shot type.** `buildStitchProps` / `buildShotProps` in `apps/video-worker/src/stitch-props.ts`.
- `handleStitch` builds `StitchShotInput[] = { src, probedSec, timing? }` from `VideoShot.clipUrl` (presigned) and `Script.subtitles` timings.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/shared/src/platform-profiles.ts` | modify | add `formatMix` to `PlatformProfile` + each profile |
| `packages/shared/src/platform-profiles.test.ts` | modify | assert `formatMix` values sum to 1 |
| `packages/db/prisma/schema.prisma` | modify | `VideoShot.shotType` (default `"avatar"`), `headline String?`, `audioUrl String?` |
| `packages/ai/src/agents/video-storyboard.ts` | modify | add `shotType`/`headline` to `VideoShotSchema`; distribute shots per `formatMix`; prompt rules for b-roll |
| `packages/ai/src/agents/video-storyboard.test.ts` | modify | assert b-roll shots carry `shotType`+`headline`; avatar default |
| `packages/ai/src/higgsfield/client.ts` | modify | `submitFoundationImage(prompt, opts?)` (generic no-Soul text2image) |
| `packages/ai/src/higgsfield/index.ts` | modify | export `submitFoundationImage` |
| `packages/ai/src/video-provider.ts` | modify | add `sceneFrame(prompt, opts?)` to the interface |
| `packages/ai/src/higgsfield/provider.ts` | modify | implement `sceneFrame` |
| `packages/ai/src/higgsfield/provider.test.ts` | modify | test `sceneFrame` submits foundation then polls |
| `apps/video-worker/src/worker.ts` | modify | branch `handleGenerate` per `shot.shotType`; thread `headline`/`audioUrl` in `handleStitch` |
| `packages/brand-kit/src/compositions/video-stitch-shared.ts` | modify | `StitchShotProps` gains `audioSrc?`, `headline?`, `clipDurationInFrames?` |
| `packages/brand-kit/src/compositions/VideoStitch.tsx` | modify | `<Audio>` track when `audioSrc`; headline overlay when `headline`; `<Loop>` b-roll clip |
| `apps/video-worker/src/stitch-props.ts` | modify | carry `audioSrc`/`headline`/`clipDurationInFrames` through `StitchShotInput`→`buildShotProps` |
| `apps/video-worker/src/stitch-props.test.ts` | modify | assert b-roll input produces `audioSrc`+`headline`+loop frames |

---

### Task 1: `formatMix` on `PlatformProfile`

**Files:**
- Modify: `packages/shared/src/platform-profiles.ts`
- Modify: `packages/shared/src/platform-profiles.test.ts`

- [ ] **Step 1: Write the failing test.** In `packages/shared/src/platform-profiles.test.ts`, add inside the existing `describe('getPlatformProfile', ...)`:

```ts
  it('every profile has a formatMix whose weights sum to 1', () => {
    for (const pl of TARGET_PLATFORMS) {
      const m = getPlatformProfile(pl).formatMix
      const sum = m.avatar + m.broll + m.screencast
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
    }
  })
  it('tiktok is avatar-heavy (storytime); instagram leans b-roll', () => {
    expect(getPlatformProfile('tiktok').formatMix.avatar).toBeGreaterThanOrEqual(0.6)
    expect(getPlatformProfile('instagram').formatMix.broll).toBeGreaterThanOrEqual(0.4)
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/shared exec vitest run src/platform-profiles.test.ts`
Expected: FAIL — `formatMix` is `undefined` on the profiles.

- [ ] **Step 3: Implement.** In `packages/shared/src/platform-profiles.ts`, add the field to the interface (after `nativeSoundImportance`):

```ts
  formatMix: { avatar: number; broll: number; screencast: number } // weights, sum = 1
```

Then add a `formatMix` to each profile in `PROFILES`:

```ts
  tiktok:    { /* …existing… */ formatMix: { avatar: 0.7, broll: 0.2, screencast: 0.1 } },
  instagram: { /* …existing… */ formatMix: { avatar: 0.4, broll: 0.4, screencast: 0.2 } },
  youtube:   { /* …existing… */ formatMix: { avatar: 0.6, broll: 0.3, screencast: 0.1 } },
  telegram:  { /* …existing… */ formatMix: { avatar: 0.5, broll: 0.3, screencast: 0.2 } },
```

(Append `formatMix` as the last key of each existing object literal; keep all current fields. Each set sums to 1.0.)

- [ ] **Step 4: Run it, verify it passes.**

Run: `pnpm --filter @contento/shared exec vitest run src/platform-profiles.test.ts`
Expected: PASS (existing tests + the 2 new ones).

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm --filter @contento/shared run typecheck`
Expected: PASS.

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add packages/shared/src/platform-profiles.ts packages/shared/src/platform-profiles.test.ts
git commit -m "feat(shared): add formatMix (avatar/broll/screencast weights) to PlatformProfile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema — `shotType` / `headline` / `audioUrl` on `VideoShot`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the fields.** In `model VideoShot` (schema.prisma:942), add after `durationSec Float`:

```prisma
  shotType     String          @default("avatar") // avatar | broll | screencast
  headline     String?         // on-screen text for b-roll/screencast shots
  audioUrl     String?         // voiceover track for non-avatar shots (avatar bakes audio into the clip)
```

(Keep `status`, `higgsfieldJobId`, `clipUrl`, `errorMessage`, the relation and indexes unchanged. `shotType` is a `String` with a default — no enum, to match the codebase's `aspectRatio`/`language` string-field convention and avoid a migration-coupled enum.)

- [ ] **Step 2: Regenerate the client and build.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes; `videoShot.shotType` / `headline` / `audioUrl` are now typed.

(Note: a live `db:migrate` needs Postgres and is part of the separate DB-migration debt — the generated client suffices for typecheck/tests here.)

- [ ] **Step 3: Typecheck the repo.**

Run: `pnpm typecheck`
Expected: PASS (no consumer references the fields yet).

- [ ] **Step 4: Commit.**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): add VideoShot.shotType, headline, audioUrl for multi-format shots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Zod `VideoShotSchema` — `shotType` + `headline`

**Files:**
- Modify: `packages/ai/src/agents/video-storyboard.ts`

- [ ] **Step 1: Extend the schema.** In `packages/ai/src/agents/video-storyboard.ts`, replace the `VideoShotSchema` definition (lines 6–11) with:

```ts
export const ShotTypeSchema = z.enum(['avatar', 'broll', 'screencast'])
export type ShotType = z.infer<typeof ShotTypeSchema>

export const VideoShotSchema = z.object({
  index: z.number().int().min(0),
  shotType: ShotTypeSchema.default('avatar'),
  prompt: z.string().min(1),
  dialogue: z.string().optional(),
  headline: z.string().optional(), // on-screen text; required-ish for broll (validated in the prompt, not the schema)
  durationSec: z.number().positive(),
})
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS (`shotType`/`headline` are optional-with-default, existing call sites still compile).

- [ ] **Step 3: Commit.**

```bash
git add packages/ai/src/agents/video-storyboard.ts
git commit -m "feat(ai): VideoShotSchema gains shotType + headline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `video-storyboard` — distribute shots by `formatMix`

**Files:**
- Modify: `packages/ai/src/agents/video-storyboard.ts`
- Modify: `packages/ai/src/agents/video-storyboard.test.ts`

- [ ] **Step 1: Write the failing test.** In `packages/ai/src/agents/video-storyboard.test.ts`, add a test that a tiktok storyboard asks for at least one b-roll shot and that the model output is accepted with `shotType`. Mirror the file's existing Anthropic mock (match its mock variable name — shown here as `mockCreate`):

```ts
  it('instructs a b-roll quota for platforms with broll weight, and parses shotType', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { index: 0, shotType: 'avatar', prompt: 'host on camera', dialogue: 'Привет', durationSec: 3 },
        { index: 1, shotType: 'broll', prompt: 'city street timelapse, no people', headline: 'Смотри сюда', durationSec: 4 },
      ]) }],
    })
    const shots = await generateVideoStoryboard('ws1', { hook: 'h', body: 'b', cta: 'c' }, { shotCount: 2, platform: 'instagram' })
    const systemText = mockCreate.mock.calls.at(-1)![0].system.map((s: { text: string }) => s.text).join('\n')
    expect(systemText).toContain('b-roll')
    expect(shots[1]!.shotType).toBe('broll')
    expect(shots[1]!.headline).toBe('Смотри сюда')
  })
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts -t "b-roll quota"`
Expected: FAIL — the prompt has no b-roll instruction.

- [ ] **Step 3: Implement the distribution.** In `generateVideoStoryboard`, after the existing `const profile = options?.platform ? getPlatformProfile(options.platform) : undefined` / `durationLine` lines, compute the b-roll quota (screencast is folded into avatar in Plan B — the worker has no synthetic renderer yet):

```ts
  // Plan B: split shots into avatar vs b-roll by the platform's formatMix.
  // screencast weight folds into avatar until Plan B2 ships the synthetic renderer.
  const brollCount = profile ? Math.round(profile.formatMix.broll * shotCount) : 0
  const formatLine = brollCount > 0
    ? `Of the ${shotCount} shots, make exactly ${brollCount} a "broll" shot and the rest "avatar". Spread the b-roll shots through the middle (never the first or last shot).`
    : 'Every shot is an "avatar" shot.'
```

Then extend the JSON field list and rules in the `system` array. Replace the field-list lines (currently `index`/`prompt`/`dialogue`/`durationSec`) with:

```ts
          'Return a JSON array. Each element must have exactly these fields:',
          '  index      — integer, starting at 0',
          '  shotType   — "avatar" or "broll"',
          '  prompt     — visual/cinematic description (max 30 words). For avatar: the person speaking. For broll: a scene with NO people and NO faces (objects, places, screens, hands, textures).',
          '  dialogue   — the spoken voiceover for this shot (direct quote from the script); omit only for a purely visual beat',
          '  headline   — REQUIRED for broll: 2–6 words of on-screen text; omit for avatar',
          '  durationSec — float, how long this shot should be (typically 1.5–5)',
          'Rules:',
          '  - First shot must be the hook (avatar); last shot must be the CTA / ending (avatar)',
          '  - ' + formatLine,
          '  - ' + durationLine,
          '  - b-roll shots keep the voiceover in `dialogue` but show no person; put the punchy phrase in `headline`',
          '  - dialogue must come directly from the provided script text',
          'Respond with valid JSON array only. No markdown fences. No extra text.',
```

(Remove the old `index`/`prompt`/`dialogue`/`durationSec` bullet lines and the old `'  - Keep the same character and visual style across all shots'` rule — b-roll breaks that constraint deliberately. Keep `systemBlock`, `characterHint`, `languageDirective`, `shotCount`.)

- [ ] **Step 4: Run the test, verify it passes.**

Run: `pnpm --filter @contento/ai exec vitest run src/agents/video-storyboard.test.ts`
Expected: PASS (existing tests + the new one). The schema's `.default('avatar')` means older mock outputs without `shotType` still parse.

- [ ] **Step 5: Typecheck + commit.**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/agents/video-storyboard.ts packages/ai/src/agents/video-storyboard.test.ts
git commit -m "feat(ai): video-storyboard distributes avatar/b-roll shots by formatMix

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `VideoProvider.sceneFrame` + Higgsfield foundation text2image

**Files:**
- Modify: `packages/ai/src/higgsfield/client.ts`
- Modify: `packages/ai/src/higgsfield/index.ts`
- Modify: `packages/ai/src/video-provider.ts`
- Modify: `packages/ai/src/higgsfield/provider.ts`
- Modify: `packages/ai/src/higgsfield/provider.test.ts`

- [ ] **Step 1: Add the generic foundation text2image client fn.** In `packages/ai/src/higgsfield/client.ts`, next to `generateCharacterPortrait`, add:

```ts
/**
 * Generate a b-roll scene image from a raw prompt via Higgsfield foundation
 * text2image (NO Soul character). Returns a jobSetId to poll with pollJobUntilDone().
 * Distinct from generateCharacterPortrait (which wraps the prompt for a person portrait).
 */
export async function submitFoundationImage(
  prompt: string,
  options?: { seed?: number },
): Promise<string> {
  return hfGenerate('/v1/text2image/foundation', {
    prompt,
    width_and_height: '1152x2048', // 9:16, matches the avatar Soul frames
    quality: '1080p',
    batch_size: 1,
    ...(options?.seed != null ? { seed: options.seed } : {}),
  })
}
```

- [ ] **Step 2: Export it.** In `packages/ai/src/higgsfield/index.ts`, add `submitFoundationImage,` to the existing `export { … } from './client.js'` list (next to `generateCharacterPortrait`).

- [ ] **Step 3: Extend the interface.** In `packages/ai/src/video-provider.ts`, add to the `VideoProvider` interface (after `motionFromImage`):

```ts
  /** Generate a b-roll scene still from a text prompt (no character/Soul); returns an image URL. */
  sceneFrame(prompt: string, opts?: { seed?: number }): Promise<string>
```

- [ ] **Step 4: Write the failing provider test.** In `packages/ai/src/higgsfield/provider.test.ts`, add to the existing mock factory the new client fn (add `submitFoundationImage: submitFoundation` to the `vi.mock('./client.js', …)` return and declare `const submitFoundation = vi.fn()` alongside the others), then add:

```ts
  it('sceneFrame submits foundation text2image then polls and returns the image url', async () => {
    submitFoundation.mockResolvedValue('job-4')
    poll.mockResolvedValue('https://hf/scene.png')
    const p = new HiggsfieldProvider()
    const url = await p.sceneFrame('city street, no people', { seed: 9 })
    expect(submitFoundation).toHaveBeenCalledWith('city street, no people', { seed: 9 })
    expect(poll).toHaveBeenCalledWith('job-4')
    expect(url).toBe('https://hf/scene.png')
  })
```

- [ ] **Step 5: Run it, verify it fails.**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/provider.test.ts -t sceneFrame`
Expected: FAIL — `sceneFrame` is not implemented.

- [ ] **Step 6: Implement.** In `packages/ai/src/higgsfield/provider.ts`, add `submitFoundationImage` to the import from `./client.js`, then add the method to `HiggsfieldProvider` (after `motionFromImage`):

```ts
  async sceneFrame(prompt: string, opts?: { seed?: number }): Promise<string> {
    let jobSetId: string
    if (opts?.seed != null) {
      jobSetId = await submitFoundationImage(prompt, { seed: opts.seed })
    } else {
      jobSetId = await submitFoundationImage(prompt)
    }
    return pollJobUntilDone(jobSetId)
  }
```

- [ ] **Step 7: Run the provider tests, verify they pass.**

Run: `pnpm --filter @contento/ai exec vitest run src/higgsfield/provider.test.ts`
Expected: PASS (existing 3 + sceneFrame).

- [ ] **Step 8: Typecheck + commit.**

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/higgsfield/client.ts packages/ai/src/higgsfield/index.ts packages/ai/src/video-provider.ts packages/ai/src/higgsfield/provider.ts packages/ai/src/higgsfield/provider.test.ts
git commit -m "feat(ai): VideoProvider.sceneFrame via Higgsfield foundation text2image (no Soul)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Worker — branch `handleGenerate` per `shotType`

**Files:**
- Modify: `apps/video-worker/src/worker.ts`

**Context:** `handleGenerate` persists storyboard shots (a `prisma.videoShot.createMany`) then loops over them. Two edits: (a) persist `shotType`/`headline`; (b) branch the per-shot generation. The avatar branch is unchanged; b-roll generates a silent visual clip AND uploads the voiceover to our S3; `screencast` falls back to the avatar branch (no synthetic renderer until Plan B2).

- [ ] **Step 1: Persist `shotType` + `headline` on shot rows.** Find the `prisma.videoShot.createMany` that maps `storyboard` shots to rows. Add the two fields to each mapped row:

```ts
      data: shots.map((shot) => ({
        videoJobId,
        index: shot.index,
        prompt: shot.prompt,
        ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
        durationSec: shot.durationSec,
        shotType: shot.shotType ?? 'avatar',
        ...(shot.headline ? { headline: shot.headline } : {}),
      })),
```

(Match the existing field names in that `createMany`; only `shotType` and the conditional `headline` are added.)

- [ ] **Step 2: Pull `audioUrl`/`headline` into the per-shot result.** In the shot loop, declare a per-shot `audioUrl` that will be persisted (alongside the existing `clipUrl`). At the top of the loop body (next to the existing `let clipUrl …`), add:

```ts
    let shotAudioUrl: string | null = null
    const shotType = shot.shotType ?? 'avatar'
    // Plan B2 not shipped: render screencast shots as avatar for now.
    const effectiveType = shotType === 'broll' ? 'broll' : 'avatar'
```

- [ ] **Step 3: Branch the non-mock generation.** Replace the non-mock generation block (worker.ts:158–188, the `// Step 1: ElevenLabs TTS …` through the `uploadBuffer(...)` that sets `clipUrl`) with a branch on `effectiveType`. Keep the avatar path byte-for-byte as today; add the b-roll path:

```ts
        if (effectiveType === 'broll') {
          // B-ROLL: voiceover plays over a silent generated scene (no talking head).
          let audioSec = 0
          if (shot.dialogue) {
            const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
            audioSec = wavDurationSec(await transcodeMp3ToWav(tts.audio))
            // Remotion plays this over the silent visual, so it lives on OUR S3 (mp3 is fine for <Audio>).
            const audioKey = `videos/shots/${videoJobId}/${shot.id}.mp3`
            shotAudioUrl = await uploadBuffer(tts.audio, audioKey, 'audio/mpeg')
            shotTimings.push({ index: shot.index, audioSec, words: tts.words })
          }
          // Foundation scene still (no Soul) → silent DoP motion clip.
          const sceneImageUrl = await provider.sceneFrame(shot.prompt, { seed })
          const higgsfieldClipUrl = await provider.motionFromImage({ imageUrl: sceneImageUrl, prompt: shot.prompt, seed })
          const clipResp = await fetch(higgsfieldClipUrl)
          if (!clipResp.ok) throw new Error(`Failed to fetch clip: ${clipResp.status}`)
          const clipBuf = Buffer.from(await clipResp.arrayBuffer())
          const clipKey = `videos/shots/${videoJobId}/${shot.id}.mp4`
          clipUrl = await uploadBuffer(clipBuf, clipKey, 'video/mp4')
        } else {
          // AVATAR: unchanged Soul → Speak/DoP path (audio baked into the clip).
          // …existing worker.ts:158–188 body verbatim…
        }
```

(Paste the current avatar body — TTS→`uploadAudio`→`characterFrame`→`talkingHead|motionFromImage`→fetch→`uploadBuffer` — verbatim into the `else` branch. `voiceId`, `seed`, `soulId`, `provider`, `shotTimings` are already in scope.)

- [ ] **Step 4: Persist `audioUrl` on the shot.** Update the `prisma.videoShot.update` that flips the shot to `DONE` (worker.ts:190) to also write `audioUrl`:

```ts
        await prisma.videoShot.update({
          where: { id: shot.id },
          data: { status: 'DONE', clipUrl, ...(shotAudioUrl ? { audioUrl: shotAudioUrl } : {}) },
        })
```

- [ ] **Step 5: Mock branch stays trivial.** Confirm the `if (mock)` branch still only sets `clipUrl = MOCK_CLIP_URL` and leaves `shotAudioUrl = null` — b-roll in mock mode renders as a plain clip with no audio track (keeps `video-worker.test.ts` green). No change needed beyond Step 2's declarations being above the mock branch.

- [ ] **Step 6: Build + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/video-worker run typecheck`
Expected: PASS.

- [ ] **Step 7: Run worker tests.**

Run: `pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS (mock-mode generate path unchanged; b-roll branch only runs non-mock).

- [ ] **Step 8: Commit.**

```bash
git add apps/video-worker/src/worker.ts
git commit -m "feat(video-worker): generate b-roll shots (foundation scene + DoP + voiceover track)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: stitch-props — carry `audioSrc` / `headline` / clip-loop frames

**Files:**
- Modify: `packages/brand-kit/src/compositions/video-stitch-shared.ts`
- Modify: `apps/video-worker/src/stitch-props.ts`
- Modify: `apps/video-worker/src/stitch-props.test.ts`

- [ ] **Step 1: Extend `StitchShotProps`.** In `packages/brand-kit/src/compositions/video-stitch-shared.ts`, add to `StitchShotProps` (after `chunks`):

```ts
  /** Voiceover track for non-avatar shots (avatar audio is baked into `src`). */
  audioSrc?: string
  /** On-screen headline for b-roll shots. */
  headline?: string
  /** Natural length of `src` in frames; when set and shorter than durationInFrames, the clip loops. */
  clipDurationInFrames?: number
```

- [ ] **Step 2: Write the failing props test.** In `apps/video-worker/src/stitch-props.test.ts`, add:

```ts
  it('b-roll input yields audioSrc, headline, and loop frames', () => {
    const props = buildStitchProps({
      // b-roll caller passes the VOICEOVER length as probedSec (drives duration) and the
      // clip's own length as clipProbedSec (drives the loop). Here: 6s voice over a 4s clip.
      shots: [{ src: 'https://x/clip.mp4', probedSec: 6, audioSrc: 'https://x/vo.mp3', headline: 'Вот так', clipProbedSec: 4,
        timing: { index: 0, audioSec: 6, words: [{ text: 'Вот', startSec: 0, endSec: 0.5 }, { text: 'так', startSec: 5.4, endSec: 6 }] } }],
      cta: 'Подпишись',
    })
    const shot = props.shots[0]!
    expect(shot.audioSrc).toBe('https://x/vo.mp3')
    expect(shot.headline).toBe('Вот так')
    expect(shot.clipDurationInFrames).toBe(Math.round(4 * 30))
    // duration follows the 6s voiceover, not the 4s clip
    expect(shot.durationInFrames).toBeGreaterThan(Math.round(5 * 30))
  })
```

- [ ] **Step 3: Run it, verify it fails.**

Run: `pnpm --filter @contento/video-worker exec vitest run src/stitch-props.test.ts -t "b-roll input"`
Expected: FAIL — `StitchShotInput` has no `audioSrc`/`headline`/`clipProbedSec`; `buildShotProps` ignores them.

- [ ] **Step 4: Implement.** In `apps/video-worker/src/stitch-props.ts`:

4a. Extend `StitchShotInput`:

```ts
export interface StitchShotInput {
  src: string
  probedSec: number
  timing?: ShotTimingJson
  audioSrc?: string
  headline?: string
  /** Natural length of the clip if it differs from `probedSec` (b-roll loops to fill the voiceover). */
  clipProbedSec?: number
}
```

4b. Change `buildShotProps` to accept and forward the new fields. Update its signature and return:

```ts
export function buildShotProps(
  src: string,
  probedSec: number,
  timing?: ShotTimingJson,
  extra?: { audioSrc?: string; headline?: string; clipProbedSec?: number },
): StitchShotProps {
  // …existing duration/words/chunks computation unchanged (uses probedSec + timing)…
  const clipDurationInFrames =
    extra?.clipProbedSec != null ? Math.max(1, Math.round(extra.clipProbedSec * STITCH_FPS)) : undefined
  return {
    src,
    durationInFrames,
    chunks,
    ...(extra?.audioSrc ? { audioSrc: extra.audioSrc } : {}),
    ...(extra?.headline ? { headline: extra.headline } : {}),
    ...(clipDurationInFrames != null ? { clipDurationInFrames } : {}),
  }
}
```

(Important: for b-roll the visual `probedSec` should be the **voiceover** length so `durationInFrames` follows the voiceover; pass the clip's own length via `clipProbedSec`. The caller in Task 9 sets `probedSec` from the audio and `clipProbedSec` from ffprobe of the clip.)

4c. Forward in `buildStitchProps`:

```ts
    shots: input.shots.map(s =>
      buildShotProps(s.src, s.probedSec, s.timing, {
        ...(s.audioSrc ? { audioSrc: s.audioSrc } : {}),
        ...(s.headline ? { headline: s.headline } : {}),
        ...(s.clipProbedSec != null ? { clipProbedSec: s.clipProbedSec } : {}),
      }),
    ),
```

- [ ] **Step 5: Run it, verify it passes.**

Run: `pnpm --filter @contento/video-worker exec vitest run src/stitch-props.test.ts`
Expected: PASS (existing + new). Build brand-kit first if the import of the new prop type fails: `pnpm --filter @contento/brand-kit run build`.

- [ ] **Step 6: Typecheck + commit.**

Run: `pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker run typecheck`
Expected: PASS.

```bash
git add packages/brand-kit/src/compositions/video-stitch-shared.ts apps/video-worker/src/stitch-props.ts apps/video-worker/src/stitch-props.test.ts
git commit -m "feat(video-worker): stitch props carry audioSrc, headline, and clip-loop frames

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `VideoStitch` — audio track, headline overlay, looped b-roll clip

**Files:**
- Modify: `packages/brand-kit/src/compositions/VideoStitch.tsx`

- [ ] **Step 1: Import the extra Remotion primitives.** At the top of `VideoStitch.tsx`, ensure `Audio` and `Loop` are imported from `remotion` (add to the existing import alongside `OffthreadVideo`, `Sequence`, `AbsoluteFill`, `interpolate`, `useCurrentFrame`):

```ts
import { AbsoluteFill, Audio, Loop, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion'
```

- [ ] **Step 2: Render headline + audio + clip loop in `ShotLayer`.** Replace the `ShotLayer` body (VideoStitch.tsx:63–85) with:

```tsx
function ShotLayer({ shot, accentColor }: { shot: StitchShotProps; accentColor: string }) {
  const frame = useCurrentFrame()
  const scale = interpolate(frame, [0, Math.max(1, shot.durationInFrames)], [1, 1.04])
  const video = (
    <OffthreadVideo
      src={shot.src}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
    />
  )
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {shot.clipDurationInFrames != null && shot.clipDurationInFrames < shot.durationInFrames ? (
        // b-roll: loop the short DoP clip to fill the (longer) voiceover.
        <Loop durationInFrames={shot.clipDurationInFrames}>{video}</Loop>
      ) : (
        video
      )}
      {shot.audioSrc && <Audio src={shot.audioSrc} />}
      {shot.headline && (
        <div
          style={{
            position: 'absolute',
            top: '14%',
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: SUBTITLE_FONT,
            fontWeight: 800,
            fontSize: 72,
            lineHeight: 1.15,
            color: '#fff',
            textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)',
          }}
        >
          {shot.headline}
        </div>
      )}
      {shot.chunks.map((c, i) => (
        <Sequence key={i} from={c.startFrame} durationInFrames={Math.max(1, c.endFrame - c.startFrame)}>
          <SubtitleChunkView chunk={c} accentColor={accentColor} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
```

(Avatar shots have no `audioSrc`/`headline`/`clipDurationInFrames`, so they render exactly as before — `<OffthreadVideo>` with its baked audio, subtitles, no headline. Only b-roll shots light up the new branches.)

- [ ] **Step 2b: Guard double audio.** `<OffthreadVideo>` plays its source audio. B-roll DoP clips are silent, so adding `<Audio>` is correct. Avatar clips carry baked audio and have no `audioSrc`, so no double track. Add a one-line code comment above the `{shot.audioSrc && …}` line stating this invariant.

- [ ] **Step 3: Smoke-render to verify no crash.** The repo has `apps/video-worker/scripts/render-smoke.ts`. Extend it (or add a sibling assertion) so its sample props include one b-roll shot with `audioSrc`, `headline`, and `clipDurationInFrames`. Then:

Run: `pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker exec tsx scripts/render-smoke.ts`
Expected: renders a 1080×1920 MP4 without throwing; the b-roll segment shows the headline and the looped clip. (If the smoke script needs network/S3 for the b-roll audio, point `audioSrc`/`src` at the existing mock public URLs used elsewhere in tests.)

- [ ] **Step 4: Typecheck + commit.**

Run: `pnpm --filter @contento/brand-kit run typecheck`
Expected: PASS.

```bash
git add packages/brand-kit/src/compositions/VideoStitch.tsx apps/video-worker/scripts/render-smoke.ts
git commit -m "feat(brand-kit): VideoStitch renders b-roll headline + voiceover track + looped clip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `handleStitch` — thread `headline` / `audioUrl` into shot inputs

**Files:**
- Modify: `apps/video-worker/src/worker.ts`

- [ ] **Step 1: Build richer `StitchShotInput`s.** In `handleStitch` (worker.ts:239), inside the `if (stitcher === 'remotion')` loop that builds `shotInputs`, replace the per-shot push so b-roll shots carry the voiceover + headline and the clip's own length. The shot loop currently probes the clip and finds the timing; change it to:

```ts
      for (const shot of shots) {
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        const src = isOwnS3Url(shot.clipUrl) ? await presignGetUrl(keyFromUrl(shot.clipUrl)) : shot.clipUrl
        const clipProbedSec = await probeDurationSec(src)
        const timing = subtitles?.shots.find((s) => s.index === shot.index)
        if (shot.audioUrl) {
          // b-roll: voiceover drives the shot duration; the silent clip loops underneath.
          const audioSrc = isOwnS3Url(shot.audioUrl) ? await presignGetUrl(keyFromUrl(shot.audioUrl)) : shot.audioUrl
          const voiceSec = timing?.audioSec ?? clipProbedSec
          shotInputs.push({
            src,
            probedSec: voiceSec,
            clipProbedSec,
            audioSrc,
            ...(shot.headline ? { headline: shot.headline } : {}),
            ...(timing ? { timing } : {}),
          })
        } else {
          // avatar: clip carries its own audio; duration = clip length (unchanged behavior).
          shotInputs.push({ src, probedSec: clipProbedSec, ...(timing ? { timing } : {}) })
        }
      }
```

(`probeDurationSec`, `presignGetUrl`, `keyFromUrl`, `isOwnS3Url`, `subtitles` are already in scope from the existing code.)

- [ ] **Step 2: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/brand-kit run build && pnpm --filter @contento/video-worker run typecheck`
Expected: PASS (`shot.audioUrl` / `shot.headline` typed from Task 2; `StitchShotInput` fields from Task 7).

- [ ] **Step 3: Run worker tests.**

Run: `pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add apps/video-worker/src/worker.ts
git commit -m "feat(video-worker): stitch threads b-roll voiceover + headline into the composition

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Full verification

- [ ] **Step 1: Repo-wide typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test`
Expected: typecheck 21/21; tests green except the known pre-existing `@contento/api` background-worker Prisma error (documented; out of scope).

- [ ] **Step 2: Trace the data path by reading.** Confirm in code: `getPlatformProfile(platform).formatMix` → `video-storyboard` emits `brollCount` b-roll shots with `shotType:'broll'` + `headline` → `handleGenerate` persists `shotType`/`headline`, and for b-roll generates `sceneFrame → motionFromImage` (silent clip) + uploads the voiceover mp3 to `shot.audioUrl` → `handleStitch` builds a `StitchShotInput` with `audioSrc` + `headline` + `clipProbedSec`, duration driven by voiceover → `VideoStitch` plays `<OffthreadVideo>` (looped) + `<Audio>` + headline + subtitles. Avatar shots are byte-for-byte unchanged. `screencast` shotType (if the model emits it) renders via the avatar fallback. Note any gap as a follow-up.

- [ ] **Step 3: (If infra available) real smoke.** With `HIGGSFIELD_MOCK` off and a connected Postgres/MinIO, run one campaign item for an `instagram` platform (broll weight 0.4) and confirm the rendered MP4 contains a b-roll segment with a headline and continuous voiceover. Under `HIGGSFIELD_MOCK` this is skipped (mock clips have no audio track).

---

## Out of scope (Plan B2 / later)

- **screencast synthetic renderer** — `<ScreencastShot>` with `slides` / `chat` / `browser` / `phone-app` templates rendered inline in `VideoStitch` (no Higgsfield), plus uploaded screen-recording from the Asset library. This plan forward-declares the `'screencast'` shotType and falls back to avatar; Plan B2 implements the renderer and switches `video-storyboard` to distribute screencast shots (restore the folded-in weight).
- **Per-format Remotion duration enforcement** beyond the voiceover-driven trimming already in `buildShotProps`.
- **Trending-sound / music layer** for b-roll (the `nativeSoundImportance` flag stays advisory).
- **B-roll clip duration matched to voiceover at generation time** (we loop the short DoP clip in Remotion instead of requesting a longer Higgsfield clip).
- **Web UI** surfacing of shot types / format mix.

## Risks / decisions surfaced

- **Looping b-roll** under a long voiceover repeats a ~5s DoP motion; acceptable for MVP. If repetition reads poorly, request a longer DoP clip (Higgsfield DoP supports 5/10/15s) — a `motionFromImage` duration param is the follow-on.
- **`<Audio>` + `<OffthreadVideo>` double-audio**: avoided because avatar clips have baked audio + no `audioSrc`, and b-roll DoP clips are silent + have `audioSrc`. The invariant is load-bearing — keep avatar `audioUrl` null.
- **`shotType` as a `String` (not a DB enum)** mirrors `aspectRatio`/`language`; the Zod `ShotTypeSchema` is the validation boundary. A `screencast` value persisted before B2 renders as avatar (safe).
- **Migration debt** — Task 2 adds columns via the generated client; the SQL migration is part of the separate, project-wide migration debt (the schema has been on `db:push` since the initial import). Generate it with the rest when Postgres is available.
- **Storyboard distribution is model-guided** (prompt asks for `brollCount` b-roll shots); the schema default keeps output valid even if the model under/over-shoots. A hard post-parse re-tag (force exactly `brollCount`) is a possible follow-on if adherence is poor.
