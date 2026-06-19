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
