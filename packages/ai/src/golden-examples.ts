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
