# Feedback loop v1 — performance-weighted golden examples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the wedge loop — make generated content get *smarter* from performance data. Build the embedding pipeline the schema was waiting for, auto-promote top-performing published scripts into `GoldenExample`s, and inject the most-similar high performers as few-shot examples into the scriptwriter and idea-generator so new content is steered by what actually worked.

**Architecture:** A new `embedText()` (OpenAI `text-embedding-3-small`, 1536-dim to match the existing `vector(1536)` columns + IVFFlat index; deterministic mock when no `OPENAI_API_KEY`) feeds three flows: (1) **populate** — `Script.embedding` is written on script creation, `GoldenExample.embedding` on golden creation; (2) **promote** — after the daily metrics poll, the top-performing published scripts (ranked by aggregated `PublicationMetric`) are promoted to `GoldenExample`s once a workspace has enough signal (cold-start guard), deduped via a new `GoldenExample.sourceScriptId`; (3) **retrieve + inject** — at generation time the current idea/trend is embedded, pgvector cosine-searches the workspace's golden examples, and the top matches are injected as a "high-performing examples" system block into `scriptwriter`/`idea-generator`. Every flow degrades gracefully (no key → mock; no goldens → no injection; <N publications → no promotion).

**Tech Stack:** TypeScript ESM (NodeNext, `.js` import extensions), pnpm + Turborepo, Prisma (Postgres + pgvector), `@contento/ai` (Anthropic agents), vitest. OpenAI Embeddings API (`text-embedding-3-small`).

---

## Scope (read first)

User decisions: **embedding provider = OpenAI `text-embedding-3-small`** (1536-dim, matches the existing column/index — no schema change to the vector type); **full loop** (embedding pipeline + retrieve/inject + **auto-promotion** from `PublicationMetric` → `GoldenExample` with a cold-start guard).

**In scope:** `embedText()` + mock; vector write/search helpers; embed `Script`/`GoldenExample` on creation; auto-promote top performers; retrieve + inject golden few-shot into `scriptwriter` and `idea-generator`; cold-start/graceful degradation throughout.

**Out of scope (later):** backfilling embeddings for pre-existing scripts/goldens (only new rows get embeddings; a one-off backfill script is a follow-up); anti-example injection (the `AntiExample` model exists but stays manual); wiring the `recommender` agent (UI-only stays); a UI surface for "why this example"; re-embedding on edit; tuning the promotion threshold / similarity-K beyond sensible defaults; multi-provider embedding abstraction (OpenAI only).

**Verified current state (from code):**
- `Script.embedding Unsupported("vector(1536)")?` (schema.prisma:498) and `GoldenExample.embedding Unsupported("vector(1536)")?` (schema.prisma:408) exist; an IVFFlat cosine index exists on `Script.embedding`. **NO code populates either** (zero embedding-generation anywhere).
- The only pgvector read is `apps/api/src/routes/library.ts` ("similar scripts", `1 - (embedding <=> $vec::vector)`), returning empty today because embeddings are null.
- `GoldenExample` (schema.prisma:401) = `{ id, workspaceId, title, content, format, platform, embedding?, timestamps }`; manually created via `apps/api/src/routes/brand-kit.ts` `POST /brand/golden-examples` (~line 680). No `sourceScriptId`, no metric link.
- `buildBrandContext(workspaceId)` (`packages/ai/src/brand-context.ts`) assembles the Brand KB `systemBlock` (`cache_control: ephemeral`); **no examples section**. `packages/ai` already imports `prisma` from `@contento/db`.
- `scriptwriter.writeScript(workspaceId, idea)` (`packages/ai/src/agents/scriptwriter.ts:53`) system array = `[systemBlock, SCHEMA_INSTRUCTION, platformInstruction(idea.platform)]`. `idea = { title, angle, format, platform }`.
- `idea-generator.generateIdeas(workspaceId, trend, count)` (`packages/ai/src/agents/idea-generator.ts:12`) system array = `[systemBlock, staticInstruction]`. `trend = { title, description? }`.
- Script creation in the campaign producer: `apps/api/src/jobs/campaign-producer.ts` `prisma.script.create({ data: { workspaceId, hook, body, cta, caption, hashtags, status } })`.
- `PublicationMetric` (schema.prisma:928, just added) = `{ publicationId, date, views, likes, comments, shares, reach, ... }`, `@@unique([publicationId, date])`. `Publication.scriptId` links a publication to its `Script`. `ingestPublicationMetrics()` runs in `apps/api/src/workers/analytics-ingester.ts` after the 24h poll.
- Higgsfield's `isMockMode()` (`packages/ai/src/higgsfield/mock.ts`) is the mock-pattern precedent.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/ai/src/embeddings.ts` | create | `embedText()` (OpenAI) + `isEmbeddingMock()` deterministic mock |
| `packages/ai/src/embeddings.test.ts` | create | mock determinism + dimension + shape |
| `packages/ai/src/golden-examples.ts` | create | `writeScriptEmbedding`, `writeGoldenEmbedding`, `promoteGoldenExample`, `searchGoldenExamples`, `buildGoldenExamplesBlock` |
| `packages/ai/src/golden-examples.test.ts` | create | `buildGoldenExamplesBlock` formatting + empty → null |
| `packages/ai/src/index.ts` | modify | export the new functions |
| `packages/db/prisma/schema.prisma` | modify | `GoldenExample.sourceScriptId String? @unique` + `promotedAt DateTime?` |
| `apps/api/src/jobs/campaign-producer.ts` | modify | embed the script on create (best-effort) |
| `apps/api/src/routes/brand-kit.ts` | modify | embed a golden example on create |
| `apps/api/src/workers/analytics-ingester.ts` | modify | `promoteTopPerformers()` after the metrics poll |
| `packages/ai/src/agents/scriptwriter.ts` | modify | inject the golden few-shot block |
| `packages/ai/src/agents/idea-generator.ts` | modify | inject the golden few-shot block |

---

### Task 1: `embedText()` — OpenAI embeddings + deterministic mock

**Files:**
- Create: `packages/ai/src/embeddings.ts`
- Create: `packages/ai/src/embeddings.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `packages/ai/src/embeddings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { embedText, EMBEDDING_DIM } from './embeddings.js'

describe('embedText (mock mode)', () => {
  const saved = process.env['OPENAI_API_KEY']
  beforeEach(() => { delete process.env['OPENAI_API_KEY'] }) // no key → mock
  afterEach(() => { if (saved !== undefined) process.env['OPENAI_API_KEY'] = saved })

  it('returns a 1536-dim vector', async () => {
    const v = await embedText('hello world')
    expect(v).toHaveLength(EMBEDDING_DIM)
    expect(v.every((n) => typeof n === 'number' && Number.isFinite(n))).toBe(true)
  })
  it('is deterministic for the same input', async () => {
    expect(await embedText('same text')).toEqual(await embedText('same text'))
  })
  it('differs for different input', async () => {
    expect(await embedText('alpha')).not.toEqual(await embedText('beta'))
  })
})
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `pnpm --filter @contento/ai exec vitest run src/embeddings.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Create `packages/ai/src/embeddings.ts`:

```ts
export const EMBEDDING_DIM = 1536
const MODEL = 'text-embedding-3-small'

/** Mock when there is no API key (dev/test/CI) — keeps the loop runnable + free. */
export function isEmbeddingMock(): boolean {
  return process.env['EMBEDDINGS_MOCK'] === '1' || !process.env['OPENAI_API_KEY']
}

/** Deterministic pseudo-embedding from a string hash — stable per input, unit-norm-ish. */
function mockEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM)
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5 // xorshift
    v[i] = ((h >>> 0) / 0xffffffff) * 2 - 1
  }
  return v
}

/** Embed text to a 1536-dim vector via OpenAI text-embedding-3-small (or a deterministic mock). */
export async function embedText(text: string): Promise<number[]> {
  const input = text.slice(0, 8000) // stay well under the token limit
  if (isEmbeddingMock()) return mockEmbed(input)

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env['OPENAI_API_KEY']}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  })
  if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text().catch(() => '')}`)
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
  const embedding = data.data?.[0]?.embedding
  if (!embedding || embedding.length !== EMBEDDING_DIM) {
    throw new Error(`OpenAI embeddings returned an unexpected shape (len ${embedding?.length})`)
  }
  return embedding
}
```

- [ ] **Step 4: Run it, verify it passes.**

Run: `pnpm --filter @contento/ai exec vitest run src/embeddings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Export + typecheck + commit.** In `packages/ai/src/index.ts` add:

```ts
export { embedText, isEmbeddingMock, EMBEDDING_DIM } from './embeddings.js'
```

Run: `pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
cd /Users/ilyaegorov/Downloads/Contento-main
git add packages/ai/src/embeddings.ts packages/ai/src/embeddings.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): embedText via OpenAI text-embedding-3-small (1536-dim) with a deterministic mock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema — `GoldenExample.sourceScriptId` for promotion dedup

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the fields.** In `model GoldenExample` (schema.prisma:401), add after `platform`:

```prisma
  sourceScriptId String?   @unique  // set when auto-promoted from a top-performing Script (dedup)
  promotedAt     DateTime?           // when the feedback loop promoted it (null = manually curated)
```

(`@unique` makes promotion idempotent — a given Script promotes at most once. No FK relation is needed; it's a soft reference so deleting the Script doesn't cascade the learned example.)

- [ ] **Step 2: Regenerate the client and build.**

Run: `pnpm --filter @contento/db run db:generate-and-build`
Expected: completes; `goldenExample.sourceScriptId` / `promotedAt` typed.

(Live `db:migrate` needs Postgres — deferred project-wide migration debt; the generated client suffices for typecheck/tests.)

- [ ] **Step 3: Typecheck + commit.**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations 2>/dev/null || git add packages/db/prisma/schema.prisma
git commit -m "feat(db): GoldenExample.sourceScriptId + promotedAt for feedback-loop promotion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Vector helpers + golden few-shot block builder

**Files:**
- Create: `packages/ai/src/golden-examples.ts`
- Create: `packages/ai/src/golden-examples.test.ts`
- Modify: `packages/ai/src/index.ts`

These wrap the pgvector raw SQL (the `embedding` column is a Prisma `Unsupported` type, so writes/reads go through `$executeRaw`/`$queryRaw` with a `::vector` cast). `packages/ai` already imports `prisma` from `@contento/db`.

- [ ] **Step 1: Implement the module.** Create `packages/ai/src/golden-examples.ts`:

```ts
import { prisma } from '@contento/db'
import { embedText } from './embeddings.js'

/** pgvector literal: '[0.1,0.2,...]' (cast to ::vector in SQL). */
function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

/** Persist a Script's embedding (raw SQL — the column is a Prisma Unsupported vector type). */
export async function writeScriptEmbedding(scriptId: string, vec: number[]): Promise<void> {
  await prisma.$executeRaw`UPDATE "Script" SET embedding = ${vectorLiteral(vec)}::vector WHERE id = ${scriptId}`
}

/** Persist a GoldenExample's embedding. */
export async function writeGoldenEmbedding(id: string, vec: number[]): Promise<void> {
  await prisma.$executeRaw`UPDATE "GoldenExample" SET embedding = ${vectorLiteral(vec)}::vector WHERE id = ${id}`
}

export interface GoldenMatch { id: string; title: string; content: string; similarity: number }

/** Top-K workspace golden examples by cosine similarity to `vec` (only rows with an embedding). */
export async function searchGoldenExamples(workspaceId: string, vec: number[], k = 3): Promise<GoldenMatch[]> {
  return prisma.$queryRaw<GoldenMatch[]>`
    SELECT id, title, content, 1 - (embedding <=> ${vectorLiteral(vec)}::vector) AS similarity
    FROM "GoldenExample"
    WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL
    ORDER BY similarity DESC
    LIMIT ${k}
  `
}

/** Format matched golden examples as a few-shot text block (or null when there's nothing to inject). */
export function formatGoldenBlock(matches: GoldenMatch[]): string | null {
  if (matches.length === 0) return null
  const lines = [
    '## High-performing examples from this brand (match their structure and energy, do not copy verbatim)',
    ...matches.map((m, i) => `${i + 1}. ${m.title ? m.title + ' — ' : ''}${m.content.slice(0, 600)}`),
  ]
  return lines.join('\n')
}

/**
 * Embed `queryText`, retrieve similar golden examples, and return the few-shot block (or null).
 * Used by scriptwriter/idea-generator. Never throws into the agent — returns null on any failure.
 */
export async function buildGoldenExamplesBlock(workspaceId: string, queryText: string, k = 3): Promise<string | null> {
  try {
    const vec = await embedText(queryText)
    const matches = await searchGoldenExamples(workspaceId, vec, k)
    return formatGoldenBlock(matches)
  } catch (err) {
    console.error('[feedback] buildGoldenExamplesBlock failed', err)
    return null
  }
}

/**
 * Promote a top-performing Script to a GoldenExample (idempotent via sourceScriptId @unique).
 * Embeds the content so it's immediately retrievable. Returns the golden id, or null if it
 * already exists / the script is missing.
 */
export async function promoteGoldenExample(scriptId: string): Promise<string | null> {
  const existing = await prisma.goldenExample.findUnique({ where: { sourceScriptId: scriptId } })
  if (existing) return null
  const script = await prisma.script.findUnique({ where: { id: scriptId } })
  if (!script) return null

  const content = [script.hook, script.body, script.cta].filter(Boolean).join('\n')
  const golden = await prisma.goldenExample.create({
    data: {
      workspaceId: script.workspaceId,
      title: script.hook.slice(0, 120),
      content,
      format: 'reel',
      platform: 'tiktok',
      sourceScriptId: scriptId,
      promotedAt: new Date(),
    },
  })
  try {
    await writeGoldenEmbedding(golden.id, await embedText(content))
  } catch (err) {
    console.error('[feedback] failed to embed promoted golden', golden.id, err)
  }
  return golden.id
}
```

(Note: `format`/`platform` default to `'reel'`/`'tiktok'` because `Script` has no platform field; the auto-promotion is platform-agnostic for v1. If a platform-aware source is wired later, thread it through.)

- [ ] **Step 2: Write the block-builder test.** Create `packages/ai/src/golden-examples.test.ts` (test the pure `formatGoldenBlock`, which needs no DB):

```ts
import { describe, it, expect } from 'vitest'
import { formatGoldenBlock } from './golden-examples.js'

describe('formatGoldenBlock', () => {
  it('returns null for no matches', () => {
    expect(formatGoldenBlock([])).toBeNull()
  })
  it('formats matches into a numbered few-shot block', () => {
    const block = formatGoldenBlock([
      { id: '1', title: 'Hook A', content: 'body a', similarity: 0.9 },
      { id: '2', title: '', content: 'body b', similarity: 0.8 },
    ])
    expect(block).toContain('High-performing examples')
    expect(block).toContain('1. Hook A — body a')
    expect(block).toContain('2. body b')
  })
})
```

- [ ] **Step 3: Run it, verify it passes.**

Run: `pnpm --filter @contento/ai exec vitest run src/golden-examples.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Export + typecheck + commit.** In `packages/ai/src/index.ts` add:

```ts
export {
  writeScriptEmbedding,
  writeGoldenEmbedding,
  searchGoldenExamples,
  buildGoldenExamplesBlock,
  promoteGoldenExample,
} from './golden-examples.js'
```

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/ai run typecheck`
Expected: PASS.

```bash
git add packages/ai/src/golden-examples.ts packages/ai/src/golden-examples.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): golden-example vector helpers + few-shot block builder + promoteGoldenExample

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Embed scripts on creation (campaign producer)

**Files:**
- Modify: `apps/api/src/jobs/campaign-producer.ts`

- [ ] **Step 1: Embed after the script is created.** Find the `prisma.script.create({ data: { ... } })` in `campaign-producer.ts` (it sets `hook/body/cta/caption/hashtags/status`). Capture the created `script` and, best-effort, write its embedding. Add the import:

```ts
import { embedText, writeScriptEmbedding } from '@contento/ai'
```

After the `const script = await prisma.script.create({ ... })`, add:

```ts
        // Feedback loop: embed the script so it's retrievable / rankable. Best-effort.
        try {
          await writeScriptEmbedding(script.id, await embedText(`${script.hook}\n${script.body}\n${script.caption}`))
        } catch (err) {
          console.error('[feedback] failed to embed script', script.id, err)
        }
```

(If `writeScript`/the producer already names the variable differently, match it. The embed must NEVER fail the producer — keep the try/catch.)

- [ ] **Step 2: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck`
Expected: PASS.

- [ ] **Step 3: api tests still exit 0.**

Run: `pnpm --filter @contento/api run test`
Expected: PASS, exit 0 (the producer isn't exercised by the unit tests; `embedText` uses mock mode anyway).

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/jobs/campaign-producer.ts
git commit -m "feat(api): embed each generated script on creation (feedback-loop retrieval)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Embed golden examples on creation (brand-kit route)

**Files:**
- Modify: `apps/api/src/routes/brand-kit.ts`

- [ ] **Step 1: Embed after a golden example is created.** In `apps/api/src/routes/brand-kit.ts`, find `POST /brand/golden-examples` (the `prisma.goldenExample.create({ data: { ... } })` ~line 680-700). Add the import (near the top, with other imports):

```ts
import { embedText, writeGoldenEmbedding } from '@contento/ai'
```

After the `const example = await prisma.goldenExample.create({ ... })`, before the reply, add:

```ts
    // Feedback loop: embed so this example is retrievable by similarity. Best-effort.
    try {
      await writeGoldenEmbedding(example.id, await embedText(example.content))
    } catch (err) {
      console.error('[feedback] failed to embed golden example', example.id, err)
    }
```

- [ ] **Step 2: Build deps + typecheck.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck`
Expected: PASS.

- [ ] **Step 3: api tests still exit 0.**

Run: `pnpm --filter @contento/api run test`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/routes/brand-kit.ts
git commit -m "feat(api): embed golden examples on creation so they're retrievable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Auto-promote top performers → golden examples

**Files:**
- Modify: `apps/api/src/workers/analytics-ingester.ts`

- [ ] **Step 1: Add `promoteTopPerformers()`.** In `apps/api/src/workers/analytics-ingester.ts`, add the import:

```ts
import { promoteGoldenExample } from '@contento/ai'
```

and a function that ranks scripts by their best publication's metrics and promotes the top ones, gated on enough signal:

```ts
const MIN_PUBLICATIONS_FOR_PROMOTION = 5 // cold-start guard: don't promote until a workspace has signal
const PROMOTE_TOP_N = 3                  // per run, per workspace

/**
 * Promote top-performing published scripts to golden examples so future generation learns
 * from what worked. Ranks each workspace's published scripts by their best publication's
 * latest views; promotes the top N once the workspace has >= MIN_PUBLICATIONS_FOR_PROMOTION
 * publications with metrics. Idempotent (promoteGoldenExample dedupes via sourceScriptId).
 */
async function promoteTopPerformers(): Promise<void> {
  // Latest metric per publication, joined to its script + workspace, for published rows.
  const rows = await prisma.publication.findMany({
    where: { status: 'PUBLISHED', metricsHistory: { some: {} } },
    select: {
      scriptId: true,
      workspaceId: true,
      metricsHistory: { orderBy: { date: 'desc' }, take: 1, select: { views: true } },
    },
  })

  // Group by workspace; rank scripts by their best publication's views.
  const byWorkspace = new Map<string, Array<{ scriptId: string; views: number }>>()
  for (const r of rows) {
    const views = r.metricsHistory[0]?.views ?? 0
    const list = byWorkspace.get(r.workspaceId) ?? []
    list.push({ scriptId: r.scriptId, views })
    byWorkspace.set(r.workspaceId, list)
  }

  for (const [, list] of byWorkspace) {
    if (list.length < MIN_PUBLICATIONS_FOR_PROMOTION) continue // cold start: not enough signal
    const top = [...list].sort((a, b) => b.views - a.views).slice(0, PROMOTE_TOP_N)
    for (const { scriptId } of top) {
      try {
        await promoteGoldenExample(scriptId) // no-op if already promoted
      } catch (err) {
        console.error('[feedback] failed to promote script', scriptId, err)
      }
    }
  }
}
```

- [ ] **Step 2: Run it after the metrics poll.** In `startAnalyticsIngester`, call `promoteTopPerformers` right after `ingestPublicationMetrics` (same 24h cadence):

```ts
export function startAnalyticsIngester(): void {
  void ingestFollowerCounts()
  setInterval(() => { void ingestFollowerCounts() }, 6 * 60 * 60 * 1000)
  void ingestPublicationMetrics()
  setInterval(() => { void ingestPublicationMetrics() }, 24 * 60 * 60 * 1000)
  void promoteTopPerformers()
  setInterval(() => { void promoteTopPerformers() }, 24 * 60 * 60 * 1000)
}
```

(Both are gated off in tests via `server.ts` `onReady` `if (process.env['VITEST']) return`. The promotion runs slightly after ingestion; using the latest snapshot is fine — it's a daily idempotent pass.)

- [ ] **Step 3: Build deps + typecheck + api tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm --filter @contento/api run typecheck && pnpm --filter @contento/api run test`
Expected: PASS, exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/src/workers/analytics-ingester.ts
git commit -m "feat(api): auto-promote top-performing scripts to golden examples (cold-start guarded)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Inject golden examples into scriptwriter + idea-generator

**Files:**
- Modify: `packages/ai/src/agents/scriptwriter.ts`
- Modify: `packages/ai/src/agents/idea-generator.ts`

- [ ] **Step 1: scriptwriter.** In `packages/ai/src/agents/scriptwriter.ts`, import the builder and inject the block when present. Add to the imports:

```ts
import { buildGoldenExamplesBlock } from '../golden-examples.js'
```

In `writeScript`, after `const { systemBlock } = await buildBrandContext(workspaceId)`, add:

```ts
  const goldenBlock = await buildGoldenExamplesBlock(workspaceId, `${idea.title}\n${idea.angle}`)
```

and change the `system` array to include it when non-null:

```ts
    system: [
      systemBlock,
      { type: 'text', text: SCHEMA_INSTRUCTION },
      { type: 'text', text: platformInstruction(idea.platform) },
      ...(goldenBlock ? [{ type: 'text' as const, text: goldenBlock }] : []),
    ],
```

- [ ] **Step 2: idea-generator.** In `packages/ai/src/agents/idea-generator.ts`, add the import:

```ts
import { buildGoldenExamplesBlock } from '../golden-examples.js'
```

After `const { systemBlock } = await buildBrandContext(workspaceId)`, add:

```ts
  const goldenBlock = await buildGoldenExamplesBlock(workspaceId, `${trend.title}\n${trend.description ?? ''}`)
```

and append it to the `system` array:

```ts
    system: [
      systemBlock,
      { type: 'text', text: 'You are a creative content strategist. Generate diverse content ideas. Respond with valid JSON only, no markdown fences.' },
      ...(goldenBlock ? [{ type: 'text' as const, text: goldenBlock }] : []),
    ],
```

(Match the file's actual static-instruction text — keep it as-is; only append the conditional golden block. `buildGoldenExamplesBlock` returns null on cold start / failure, so generation is unchanged when there are no golden examples.)

- [ ] **Step 3: Typecheck + tests.**

Run: `pnpm --filter @contento/ai run typecheck && pnpm --filter @contento/ai exec vitest run`
Expected: PASS. The existing agent tests mock the Anthropic client; `buildGoldenExamplesBlock` calls `embedText` (mock mode in tests, no key) + a prisma `$queryRaw`. If the `@contento/ai` agent tests do NOT mock prisma and a `$queryRaw` would fail, the `buildGoldenExamplesBlock` try/catch returns null (safe) — but confirm the agent tests still pass. If a test asserts the exact `system` array length, update it to tolerate the optional block (it's absent in tests since `searchGoldenExamples` returns nothing / errors to null).

> If the scriptwriter/idea-generator tests run against a real-ish prisma and the raw query throws, the catch returns null and the block is simply omitted — assert the agents still produce output. If a test inspects `system`, it should check `toContain` the known blocks rather than exact length.

- [ ] **Step 4: Commit.**

```bash
git add packages/ai/src/agents/scriptwriter.ts packages/ai/src/agents/idea-generator.ts
git commit -m "feat(ai): inject similar high-performing golden examples into scriptwriter + idea-generator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verification

- [ ] **Step 1: Repo-wide typecheck + tests.**

Run: `pnpm --filter @contento/db run db:generate-and-build && pnpm typecheck && pnpm test`
Expected: typecheck 21/21; tests green (new ai embeddings/golden tests pass; api 13/13 exit 0).

- [ ] **Step 2: Trace the loop by reading.** Confirm the closed loop: script created → `embedText` → `Script.embedding` (Task 4); golden created → embedded (Task 5); 24h metrics poll → `promoteTopPerformers` ranks by `PublicationMetric.views` → `promoteGoldenExample` (embeds, dedups via `sourceScriptId`) once a workspace has ≥5 publications (Task 6); next generation → `buildGoldenExamplesBlock(workspaceId, ideaText)` embeds the idea, cosine-searches `GoldenExample`, injects the top-3 as a few-shot block into scriptwriter + idea-generator (Task 7). Cold-start: no key → mock embeddings; no goldens → `searchGoldenExamples` returns []→ `formatGoldenBlock` null → no injection. Note any gap as a follow-up.

- [ ] **Step 3: (If infra available) real smoke.** With `OPENAI_API_KEY` set + a Postgres with pgvector: create a golden example via the brand-kit route, confirm `GoldenExample.embedding` is non-null, then call `searchGoldenExamples(workspaceId, embedText('related topic'), 3)` and confirm it returns the example with a similarity score. Under mock mode this is exercised only structurally (deterministic vectors still produce valid cosine results).

---

## Out of scope (later, as follow-ups)
- **Backfill** embeddings for pre-existing scripts/golden examples (a one-off script) — only new rows are embedded going forward.
- **Anti-example injection** (the `AntiExample` model stays manual; a "avoid these patterns" block is a natural extension).
- **Wiring the `recommender` agent** into generation (stays UI-only).
- **Per-platform promotion** (`promoteGoldenExample` defaults format/platform; thread the real platform when the source carries it).
- **Re-embedding on edit**, similarity-K / threshold tuning, an embedding-provider abstraction (OpenAI only), and surfacing "learned from post X" in the UI.
- **Multi-signal ranking** (the v1 ranks by latest `views`; engagement-rate / recency-decay weighting is a refinement). Note: metrics are YouTube-only today, so promotion mostly fires on YouTube performers until IG/TikTok audits land.

## Risks / decisions surfaced
- **OpenAI dependency + cost**: embeddings cost ~$0.02/1M tokens (`text-embedding-3-small`); negligible at this volume. No key → deterministic mock keeps dev/test/CI free and runnable (the mock yields valid 1536-dim vectors so similarity search still functions structurally, just not semantically).
- **Cold start**: nothing breaks with zero data — no goldens → no injection; <5 publications → no promotion; mock embeddings in dev. The loop only produces *semantic* lift once real `OPENAI_API_KEY` + real golden examples exist.
- **`embedding` is a Prisma `Unsupported` type** → all writes/reads use raw SQL with `::vector` casts (mirrors the existing `library.ts` similarity query). The IVFFlat index on `Script.embedding` exists; a matching index on `GoldenExample.embedding` should be added in the eventual migration (noted; the `@@index` can't express ivfflat in Prisma — it's a raw migration concern).
- **Promotion ranks by latest `views`** — simple and robust for v1. Because metrics are YouTube-only today, promotion currently learns from YouTube winners; revisit weighting when more platforms expose metrics.
- **Migration debt**: Task 2 adds columns via the generated client; the SQL migration (incl. the `GoldenExample` vector index) is part of the deferred project-wide migration debt.
- **Best-effort embedding everywhere**: every embed call is wrapped so a missing key / OpenAI outage never breaks script generation, golden creation, or the producer.
