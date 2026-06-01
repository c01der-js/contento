import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify the Higgsfield webhook signature.
 * Higgsfield signs the raw request body with HMAC-SHA256 using the webhook secret.
 *
 * PREREQUISITE: Confirm the exact header name and HMAC scheme against Higgsfield
 * docs — adjust SIGNATURE_HEADER and the digest format if they differ.
 */
const SIGNATURE_HEADER = 'x-higgsfield-signature'

export function verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env['HIGGSFIELD_WEBHOOK_SECRET']
  if (!secret) return false

  const sig = headers[SIGNATURE_HEADER]
  if (!sig || typeof sig !== 'string') return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const sigBuf = Buffer.from(sig)

  if (expectedBuf.length !== sigBuf.length) return false
  return timingSafeEqual(expectedBuf, sigBuf)
}
