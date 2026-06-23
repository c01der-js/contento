import { describe, it, expect, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'
import { decodeUserId } from './auth.js'

const SECRET = 'test-secret'
beforeAll(() => { process.env.JWT_SECRET = SECRET })

describe('decodeUserId', () => {
  it('returns the sub for a token signed with JWT_SECRET', () => {
    const token = jwt.sign({ sub: 'user_123' }, SECRET)
    expect(decodeUserId(token)).toBe('user_123')
  })
  it('returns null for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user_123' }, 'wrong-secret')
    expect(decodeUserId(token)).toBeNull()
  })
  it('returns null for a malformed token', () => {
    expect(decodeUserId('not-a-jwt')).toBeNull()
  })
  it('returns null when the payload has no sub', () => {
    const token = jwt.sign({ foo: 'bar' }, SECRET)
    expect(decodeUserId(token)).toBeNull()
  })
})
