import { describe, it, expect, vi } from 'vitest'
import { withRetry, HttpStatusError } from './retry.js'

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient network errors and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('retries 429 and 5xx HttpStatusError', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpStatusError(429, 'rate limited'))
      .mockRejectedValueOnce(new HttpStatusError(502, 'bad gateway'))
      .mockResolvedValue('ok')
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry non-429 4xx errors', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpStatusError(400, 'invalid_audio_format'))
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('invalid_audio_format')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpStatusError(503, 'down'))
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('down')
    expect(fn).toHaveBeenCalledTimes(3) // 1 попытка + 2 ретрая
  })
})
