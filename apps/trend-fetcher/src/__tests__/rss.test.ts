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
