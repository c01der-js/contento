/** HTTP error that preserves the status code so retry logic can classify it. */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpStatusError'
  }
}

export interface RetryOptions {
  /** Extra attempts after the first one (default 3). */
  retries?: number
  /** Delay before retry #1; doubles each retry (default 1000ms). */
  baseDelayMs?: number
  onRetry?: (attempt: number, err: unknown) => void
}

function isTransient(err: unknown): boolean {
  // Deterministic client errors (bad payload, auth) must not be retried;
  // 429 and 5xx are worth retrying. Anything non-HTTP (network failure,
  // fetch TypeError) is treated as transient.
  if (err instanceof HttpStatusError) return err.status === 429 || err.status >= 500
  return true
}

/** Run `fn` with exponential backoff on transient failures. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 1000
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransient(err) || attempt === retries) throw err
      opts.onRetry?.(attempt + 1, err)
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastErr
}
