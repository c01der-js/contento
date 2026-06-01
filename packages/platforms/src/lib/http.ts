export class PublisherError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly retryable: boolean,
    public readonly platform: string,
  ) {
    super(message)
    this.name = 'PublisherError'
  }
}

export interface RetryOptions {
  maxAttempts?: number
  initialBackoffMs?: number
  maxBackoffMs?: number
  /** Called on 401 — should mutate credentials and resolve when ready. Throw to give up. */
  onUnauthorized?: () => Promise<void>
}

const DEFAULTS = {
  maxAttempts: 4,
  initialBackoffMs: 500,
  maxBackoffMs: 8_000,
}

/**
 * Fetch with retry on 408/429/5xx (exponential backoff with jitter) and a
 * single best-effort refresh on 401 via opts.onUnauthorized. Treats network
 * errors as retryable. Returns the final Response (caller is responsible for
 * reading the body and deciding how to surface non-OK statuses).
 */
export async function requestWithRetry(
  platform: string,
  url: string,
  init: Parameters<typeof fetch>[1] = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const cfg = { ...DEFAULTS, ...opts }
  let refreshed = false
  let lastError: unknown = null

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init)

      if (res.status === 401 && opts.onUnauthorized && !refreshed) {
        refreshed = true
        await opts.onUnauthorized()
        // retry immediately with new credentials (init headers must be set by caller after refresh — pass a fresh init via closure if needed)
        continue
      }

      if (isRetryableStatus(res.status) && attempt < cfg.maxAttempts) {
        const wait = retryAfter(res) ?? backoff(attempt, cfg.initialBackoffMs, cfg.maxBackoffMs)
        await sleep(wait)
        continue
      }

      return res
    } catch (err) {
      lastError = err
      if (attempt >= cfg.maxAttempts) break
      await sleep(backoff(attempt, cfg.initialBackoffMs, cfg.maxBackoffMs))
    }
  }

  throw new PublisherError(
    `Network error after ${cfg.maxAttempts} attempts: ${(lastError as Error)?.message ?? lastError}`,
    null,
    true,
    platform,
  )
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600)
}

function retryAfter(res: Response): number | null {
  const h = res.headers.get('retry-after')
  if (!h) return null
  const sec = Number(h)
  if (Number.isFinite(sec)) return Math.min(sec * 1000, 30_000)
  const date = new Date(h)
  if (!Number.isNaN(date.getTime())) {
    return Math.min(Math.max(date.getTime() - Date.now(), 0), 30_000)
  }
  return null
}

function backoff(attempt: number, initial: number, max: number): number {
  const base = Math.min(initial * 2 ** (attempt - 1), max)
  return base + Math.random() * base * 0.3 // ±30% jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Throw a typed PublisherError from a non-OK Response. Reads body once for the
 * message. Decides retryable based on the same rules as requestWithRetry — but
 * since we got past the retry loop, the caller can decide whether to surface
 * "retryable" upstream (e.g. for BullMQ requeue) or fail hard.
 */
export async function throwForResponse(
  platform: string,
  res: Response,
  contextLabel: string,
): Promise<never> {
  let message = `${platform} ${contextLabel} failed: HTTP ${res.status}`
  try {
    const text = await res.text()
    if (text) message += ` — ${text.slice(0, 500)}`
  } catch {
    // body unreadable
  }
  throw new PublisherError(message, res.status, isRetryableStatus(res.status), platform)
}
