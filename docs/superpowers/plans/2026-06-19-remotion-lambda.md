# Remotion Lambda — render migration design + prerequisites

> **For agentic workers:** This is a **flag-gated infrastructure migration**, not a pure TDD feature. The code changes (Tasks 1–5) are buildable and typecheckable in this repo behind `VIDEO_STITCHER=lambda` (local `remotion` stays the default). The **actual Lambda deploy + render (Task 6) requires AWS + a Remotion Company License and CANNOT be verified in CI/dev** — it is documented, not executed. Use superpowers:subagent-driven-development for Tasks 1–5 only.

**Goal:** Add a Lambda render path (`@remotion/lambda` `renderMediaOnLambda`) behind the existing `VIDEO_STITCHER` flag so video rendering can scale off the worker box onto AWS Lambda when render volume justifies it — without changing the local-render default or breaking the current pipeline.

**Architecture:** The worker's `renderStitchVideo` gains a `lambda` branch (selected by `VIDEO_STITCHER=lambda`) that calls `renderMediaOnLambda({ functionName, serveUrl, composition: VIDEO_STITCH_ID, inputProps })` against a pre-deployed Remotion Lambda function + site, then downloads the result to the same `outputPath` the local path produces — so everything downstream (`uploadVideo` → `VideoJob.outputUrl`) is unchanged. A one-time `deploy-lambda` script (`deploySite` + `deployFunction`) publishes the `@contento/brand-kit` composition bundle to AWS. Local Remotion (`VIDEO_STITCHER=remotion`, the default) and the ffmpeg fallback are untouched.

**Tech Stack:** TypeScript ESM (NodeNext), `@remotion/lambda` 4.0.468 (must match the repo's `remotion`/`@remotion/bundler`/`@remotion/renderer` 4.0.468), AWS Lambda + S3, `@aws-sdk/*`.

---

## ⚠️ Prerequisites (HARD GATES — resolve before Task 6 / any real render)

These are **business/infra decisions outside this codebase**. Tasks 1–5 build the code; Task 6 cannot proceed until ALL three are satisfied:

1. **Remotion Company License.** Remotion is free for individuals/≤3-employee companies but requires a paid Company License for for-profit use at 4+ employees (~$25/dev/mo, min ~$100/mo) — and **Remotion Lambda specifically requires a license**. This is a legal/cost gate the owner must clear. Do not deploy to Lambda without it.

2. **AWS account + IAM.** A Remotion Lambda deployment needs an AWS account, an IAM user/role with the Remotion Lambda policy (`@remotion/lambda` ships a policy generator), `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`, and an S3 bucket Remotion manages for the site + outputs.

3. **Input media must be reachable from AWS Lambda (THE load-bearing blocker).** Today the shot clips + audio live in **MinIO at `localhost:9000`** (private), presigned for the local renderer. A Lambda render runs inside AWS and fetches the `<OffthreadVideo src>` / `<Audio src>` URLs over the public internet. **Private MinIO / any RU-hosted storage AWS cannot reach will fail the render.** Before Lambda is viable, the media bucket must be **real S3 (or a publicly-reachable CDN)** with presigned URLs whose host AWS can resolve, and the presign TTL must exceed the Lambda render time (raise from 1h if needed). This couples to the broader deploy-phase storage decision — see `[[contento-known-issues]]`.

If any gate is unmet, keep `VIDEO_STITCHER=remotion` (local) — the code from Tasks 1–5 is dormant and harmless.

---

## Verified current state (from code)

- `apps/video-worker/src/remotion-stitch.ts`: `renderStitchVideo(props, outputPath)` = cached `bundle({ entryPoint: @contento/brand-kit/src/remotion-entry.ts, publicDir, webpackOverride extensionAlias })` → `selectComposition({ serveUrl, id: VIDEO_STITCH_ID, inputProps })` → `renderMedia({ composition, serveUrl, codec:'h264', crf:20, outputLocation: outputPath, inputProps, timeoutInMilliseconds: 180_000 })`.
- `apps/video-worker/src/worker.ts:322`: `const stitcher = process.env['VIDEO_STITCHER'] ?? 'remotion'` → `if (stitcher === 'remotion') { …presign clips… renderStitchVideo(props, outputPath) } else { …ffmpeg… }`. After render: `uploadVideo(outputPath, key)` → `VideoJob.outputUrl`.
- `packages/brand-kit/src/remotion-entry.ts` = `registerRoot(RemotionRoot)`; `remotion-root.tsx` registers `VIDEO_STITCH_ID` (1080×1920, fps `VIDEO_STITCH_FPS`, dynamic duration via `calcStitchDurationInFrames`) + the template compositions.
- Versions: `remotion`/`@remotion/player`/`@remotion/fonts` (brand-kit) + `@remotion/bundler`/`@remotion/renderer` (video-worker, render-worker) all **4.0.468**. `@remotion/lambda` is NOT installed.
- `apps/video-worker/src/s3-client.ts`: `S3Client({ endpoint: S3_ENDPOINT ?? 'http://localhost:9000', region:'us-east-1', credentials: S3_ACCESS_KEY/S3_SECRET_KEY, forcePathStyle:true })`; `presignGetUrl(key, 3600)`. Clips: Higgsfield CDN → re-uploaded to our S3/MinIO; `handleStitch` presigns own-S3 URLs (`isOwnS3Url` → `presignGetUrl`).
- No `AWS_*` / `@remotion/lambda` / `deploySite` anywhere. `infra/.env.example` has only MinIO vars.
- `render-worker` uses the same bundle pattern with `renderStill()` (PNG) — **out of scope here** (video-stitch is the heavy render; covers it as a follow-on once the video path is proven).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/video-worker/package.json` | modify | add `@remotion/lambda@4.0.468` |
| `apps/video-worker/src/lambda-render.ts` | create | `renderStitchOnLambda(props, outputPath)` — `renderMediaOnLambda` + download |
| `apps/video-worker/src/remotion-stitch.ts` | modify | export a `RENDER_BACKEND` selector or keep local fn unchanged (the branch lives in the worker) |
| `apps/video-worker/src/worker.ts` | modify | `VIDEO_STITCHER==='lambda'` → `renderStitchOnLambda` |
| `apps/video-worker/scripts/deploy-lambda.ts` | create | one-time `deploySite` + `deployFunction` (run manually with AWS creds) |
| `infra/.env.example` | modify | document the Lambda env vars (AWS creds/region, function name, site name) |
| `docs/.../remotion-lambda.md` | (this doc) | prerequisites + runbook |

---

### Task 1: Add `@remotion/lambda` (version-locked)

**Files:**
- Modify: `apps/video-worker/package.json`

- [ ] **Step 1: Add the dep.** In `apps/video-worker/package.json` `dependencies`, add (EXACT version match with the other Remotion packages — Lambda refuses mismatched versions):

```json
    "@remotion/lambda": "4.0.468",
```

Then from the repo root: `pnpm install`.

- [ ] **Step 2: Confirm it resolves + nothing else broke.**

Run: `pnpm --filter @contento/video-worker run typecheck`
Expected: PASS (the dep is installed; not yet imported).

- [ ] **Step 3: Commit.**

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add apps/video-worker/package.json pnpm-lock.yaml
git commit -m "chore(video-worker): add @remotion/lambda@4.0.468 (version-locked to remotion 4.0.468)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `renderStitchOnLambda` — the Lambda render path

**Files:**
- Create: `apps/video-worker/src/lambda-render.ts`

- [ ] **Step 1: Implement.** Create `apps/video-worker/src/lambda-render.ts`. It mirrors `renderStitchVideo`'s signature so the worker can swap them, but renders on a pre-deployed Lambda function + site (deployed by Task 4) and downloads the output to `outputPath`:

```ts
import { writeFile } from 'fs/promises'
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client'
import { VIDEO_STITCH_ID, type VideoStitchProps } from '@contento/brand-kit'

// The Lambda function + site are deployed once by scripts/deploy-lambda.ts; their names are
// passed via env so the worker never deploys at render time.
function lambdaConfig() {
  const region = process.env['REMOTION_AWS_REGION']
  const functionName = process.env['REMOTION_LAMBDA_FUNCTION']
  const serveUrl = process.env['REMOTION_SERVE_URL'] // the deploySite() URL (an S3 site)
  if (!region || !functionName || !serveUrl) {
    throw new Error('Lambda render requires REMOTION_AWS_REGION, REMOTION_LAMBDA_FUNCTION, REMOTION_SERVE_URL')
  }
  return { region: region as Parameters<typeof renderMediaOnLambda>[0]['region'], functionName, serveUrl }
}

/**
 * Render the VideoStitch composition on AWS Lambda and download the MP4 to `outputPath`.
 * Drop-in replacement for renderStitchVideo (same signature) selected by VIDEO_STITCHER=lambda.
 * REQUIRES: deployed Lambda function + site, AWS creds in env, and input clip/audio URLs that
 * are reachable from AWS (real S3 / public CDN — NOT private MinIO). See the plan's prerequisites.
 */
export async function renderStitchOnLambda(props: VideoStitchProps, outputPath: string): Promise<void> {
  const { region, functionName, serveUrl } = lambdaConfig()

  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: VIDEO_STITCH_ID,
    inputProps: props as unknown as Record<string, unknown>,
    codec: 'h264',
    crf: 20,
    // Remotion Lambda renders frame ranges across many invocations; downloadBehavior keeps the
    // MP4 in the Remotion-managed bucket until we fetch it.
    downloadBehavior: { type: 'play-in-browser' },
  })

  // Poll until done, then fetch the output URL and write it to outputPath.
  for (;;) {
    const progress = await getRenderProgress({ renderId, bucketName, functionName, region })
    if (progress.fatalErrorEncountered) {
      throw new Error(`Lambda render failed: ${progress.errors?.[0]?.message ?? 'unknown error'}`)
    }
    if (progress.done) {
      const url = progress.outputFile
      if (!url) throw new Error('Lambda render finished without an output file')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to download Lambda output: ${res.status}`)
      await writeFile(outputPath, Buffer.from(await res.arrayBuffer()))
      return
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
}
```

> Note: the exact `@remotion/lambda/client` API surface (`renderMediaOnLambda`, `getRenderProgress`, the `region` union type) is pinned to 4.0.468 — if the import path or field names differ in that version, adjust to match the installed package's types (the implementer should check `node_modules/@remotion/lambda` types). The shape above is the documented 4.x API.

- [ ] **Step 2: Typecheck.**

Run: `pnpm --filter @contento/video-worker run typecheck`
Expected: PASS (the function compiles against the installed `@remotion/lambda` types; it is not invoked unless `VIDEO_STITCHER=lambda`).

- [ ] **Step 3: Commit.**

```bash
git add apps/video-worker/src/lambda-render.ts
git commit -m "feat(video-worker): renderStitchOnLambda (renderMediaOnLambda + download), env-configured

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the `lambda` branch into the worker

**Files:**
- Modify: `apps/video-worker/src/worker.ts`

- [ ] **Step 1: Route on the flag.** In `handleStitch` (`worker.ts:322`), the current branch is `if (stitcher === 'remotion') { … renderStitchVideo(props, outputPath) } else { …ffmpeg… }`. Add a `lambda` case that reuses the SAME presigned-prop building as the remotion path (the props are identical; only the render call differs). Add the import:

```ts
import { renderStitchOnLambda } from './lambda-render.js'
```

Restructure the render call so `lambda` and `remotion` share the prop-building (clips are already presigned above) and only differ at the final call:

```ts
      // ...existing presign + buildStitchProps producing `props` and `outputPath`...
      if (stitcher === 'lambda') {
        await renderStitchOnLambda(props, outputPath)
      } else {
        await renderStitchVideo(props, outputPath)
      }
```

(Keep the `else` ffmpeg branch — i.e. the outer structure becomes: `if (stitcher === 'remotion' || stitcher === 'lambda') { build presigned props; lambda ? onLambda : local } else { ffmpeg }`. Match the file's actual control flow; the key is `lambda` and `remotion` share everything except the one render call. Do NOT duplicate the presign/buildStitchProps logic.)

- [ ] **Step 2: Typecheck + tests.**

Run: `pnpm --filter @contento/video-worker run typecheck && pnpm --filter @contento/video-worker exec vitest run`
Expected: PASS. The existing video-worker tests use `VIDEO_STITCHER` default (`remotion`) or mock mode, so the lambda branch isn't exercised — confirm they stay green.

- [ ] **Step 3: Commit.**

```bash
git add apps/video-worker/src/worker.ts
git commit -m "feat(video-worker): VIDEO_STITCHER=lambda routes stitch to renderStitchOnLambda

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: One-time `deploy-lambda` script

**Files:**
- Create: `apps/video-worker/scripts/deploy-lambda.ts`

This is run MANUALLY by an operator with AWS creds (not in CI, not at render time). It deploys the Remotion Lambda function and the composition site.

- [ ] **Step 1: Create the script.** `apps/video-worker/scripts/deploy-lambda.ts`:

```ts
/**
 * One-time Remotion Lambda deploy. Run with AWS creds in env:
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... REMOTION_AWS_REGION=us-east-1 \
 *     pnpm --filter @contento/video-worker exec tsx scripts/deploy-lambda.ts
 * Prints REMOTION_LAMBDA_FUNCTION and REMOTION_SERVE_URL to set in the worker env.
 * REQUIRES a Remotion Company License (Lambda is license-gated). See the plan prerequisites.
 */
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { deployFunction, deploySite, getOrCreateBucket } from '@remotion/lambda'

const region = (process.env['REMOTION_AWS_REGION'] ?? 'us-east-1') as Parameters<typeof deployFunction>[0]['region']

async function main() {
  const require_ = createRequire(import.meta.url)
  const pkgDir = dirname(require_.resolve('@contento/brand-kit/package.json'))
  const entryPoint = join(pkgDir, 'src/remotion-entry.ts')

  const { bucketName } = await getOrCreateBucket({ region })

  const { functionName } = await deployFunction({
    region,
    timeoutInSeconds: 240,
    memorySizeInMb: 3008,
    diskSizeInMb: 10240,
    createCloudWatchLogGroup: true,
  })

  const { serveUrl } = await deploySite({
    region,
    bucketName,
    entryPoint,
    siteName: 'contento-videostitch',
  })

  console.log('REMOTION_LAMBDA_FUNCTION=' + functionName)
  console.log('REMOTION_SERVE_URL=' + serveUrl)
  console.log('REMOTION_AWS_REGION=' + region)
}

main().catch((err) => {
  console.error('[deploy-lambda] failed:', err)
  process.exit(1)
})
```

> The `deploySite` `entryPoint` is the SAME `remotion-entry.ts` the local bundler uses, so the deployed site renders the identical compositions. Re-run this script whenever the brand-kit compositions change (it re-uploads the site). The exact `@remotion/lambda` deploy API (`deployFunction`/`deploySite`/`getOrCreateBucket` options) is per 4.0.468 — verify field names against the installed types.

- [ ] **Step 2: Typecheck (compiles; not executed).**

Run: `pnpm --filter @contento/video-worker run typecheck`
Expected: PASS. (The script is type-checked but only RUN manually with AWS creds — it is not part of CI.)

- [ ] **Step 3: Commit.**

```bash
git add apps/video-worker/scripts/deploy-lambda.ts
git commit -m "feat(video-worker): one-time Remotion Lambda deploy script (deploySite + deployFunction)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Document the env vars

**Files:**
- Modify: `infra/.env.example`

- [ ] **Step 1: Add a Remotion Lambda section.** In `infra/.env.example`, add (commented, since Lambda is opt-in):

```
# ── Remotion Lambda (optional — set VIDEO_STITCHER=lambda to use) ───────────────
# Requires a Remotion Company License + AWS account. Run scripts/deploy-lambda.ts once,
# then paste its output here. Input clip/audio URLs MUST be reachable from AWS (real S3/CDN,
# not private MinIO) — see docs/superpowers/plans/2026-06-19-remotion-lambda.md.
# VIDEO_STITCHER=lambda
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# REMOTION_AWS_REGION=us-east-1
# REMOTION_LAMBDA_FUNCTION=
# REMOTION_SERVE_URL=
```

- [ ] **Step 2: Commit.**

```bash
git add infra/.env.example
git commit -m "docs(infra): document Remotion Lambda env vars (opt-in, license + AWS gated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Deploy + verify (MANUAL — requires the prerequisites; NOT executable in CI/dev)

> **Do NOT attempt in this environment.** This task is the runbook for an operator once the three prerequisites (license, AWS, AWS-reachable media) are satisfied.

- [ ] **Step 1: Provision.** Obtain the Remotion Company License. Create an AWS IAM user with the Remotion Lambda policy (`npx remotion lambda policies` generates it). Set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`REMOTION_AWS_REGION`.
- [ ] **Step 2: Move media to AWS-reachable storage.** Point the video-worker `S3_ENDPOINT`/bucket at real S3 (or a public CDN) so presigned clip/audio URLs resolve from Lambda. Raise the presign TTL (`presignGetUrl` default 3600s) above the worst-case Lambda render time.
- [ ] **Step 3: Deploy.** `pnpm --filter @contento/video-worker exec tsx scripts/deploy-lambda.ts`; paste `REMOTION_LAMBDA_FUNCTION` / `REMOTION_SERVE_URL` into the worker env.
- [ ] **Step 4: Smoke render.** Set `VIDEO_STITCHER=lambda`, run one real campaign video end-to-end, confirm `VideoJob.outputUrl` is a valid MP4 and the Lambda render finished without `fatalErrorEncountered`. Watch CloudWatch logs for input-fetch (403/timeout = the media-reachability gate not cleared).
- [ ] **Step 5: Cost/limits check.** Confirm Lambda concurrency limits + per-render cost are acceptable at the expected volume before flipping the default. Keep `VIDEO_STITCHER=remotion` as the rollback.

---

## Out of scope (later, as follow-ups)
- **render-worker (PNG visuals) on Lambda** (`renderStillOnLambda`) — same pattern; migrate after the video path is proven in production.
- **Making `lambda` the default** — stays opt-in behind the flag until cost/volume justify it; the roadmap defers Lambda to "when render volume justifies it."
- **Media storage migration** to real S3/CDN — the load-bearing prerequisite; tracked with the broader deploy-phase storage work in `[[contento-known-issues]]`.
- **CI deploy of the Lambda site** on brand-kit composition changes — manual `deploy-lambda.ts` re-run for now.
- **A vitest test for the lambda branch** — the render call is an AWS round-trip; not unit-testable without mocking `@remotion/lambda`. The flag routing is verified by the existing (remotion-default) tests staying green.

## Risks / decisions surfaced
- **License is a hard gate.** Remotion Lambda requires a Company License for for-profit 4+-employee use. Tasks 1–5 are dormant code; Task 6 must not run without the license.
- **Input reachability is the real blocker** (roadmap-flagged): Lambda fetches `<OffthreadVideo>`/`<Audio>` srcs over the internet. Private MinIO / RU-hosted clips fail. Media must move to AWS-reachable S3/CDN first.
- **Version lock**: `@remotion/lambda` must exactly match `remotion` 4.0.468; a future Remotion bump must update all of them together AND re-run `deploy-lambda.ts` (the deployed function is version-pinned).
- **Presign TTL vs render time**: bump `presignGetUrl`'s 3600s if a Lambda render (many parallel invocations + cold start) risks exceeding it.
- **Verification limit**: only Tasks 1–5 (dep, code, flag, script, env) are buildable/typecheckable here; the deploy + real render (Task 6) needs AWS + license and is a documented runbook, not a CI step.
- **Migration debt couples in**: the media-on-real-S3 prerequisite overlaps the deferred deploy-phase storage + SQL-migration work — sequence them together.
