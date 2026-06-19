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
