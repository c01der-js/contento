import { describe, it, expect } from 'vitest'
import { runQaChecks } from './checks.js'

const base = {
  platform: 'tiktok' as string | null,
  outputUrl: 'https://s3/out.mp4' as string | null,
  jobStatus: 'DONE',
  shots: [
    { index: 0, durationSec: 10, dialogue: 'привет', status: 'DONE' },
    { index: 1, durationSec: 18, dialogue: 'пока', status: 'DONE' },
  ],
  subtitles: { version: 1 as const, shots: [
    { index: 0, audioSec: 10, words: [{ text: 'привет', startSec: 0, endSec: 1 }] },
    { index: 1, audioSec: 18, words: [{ text: 'пока', startSec: 0, endSec: 1 }] },
  ] },
}

describe('runQaChecks', () => {
  it('PASS when output ready, all shots done, duration in band, subtitles complete', () => {
    // tiktok band is 21-34; 10+18=28 is in band
    const r = runQaChecks(base)
    expect(r.status).toBe('PASS')
    expect(r.findings.find((f) => f.id === 'duration')?.severity).toBe('pass')
    expect(r.findings.find((f) => f.id === 'lip-sync')?.severity).toBe('skip')
  })

  it('BLOCK when the video output is missing', () => {
    const r = runQaChecks({ ...base, outputUrl: null })
    expect(r.status).toBe('BLOCK')
    expect(r.findings.find((f) => f.id === 'output-ready')?.severity).toBe('block')
  })

  it('BLOCK when a shot is not DONE', () => {
    const r = runQaChecks({ ...base, shots: [{ index: 0, durationSec: 28, dialogue: 'x', status: 'FAILED' }] })
    expect(r.status).toBe('BLOCK')
    expect(r.findings.find((f) => f.id === 'shots-rendered')?.severity).toBe('block')
  })

  it('WARN when total duration is outside the platform band', () => {
    // 3+3 = 6s, well under tiktok min 21
    const r = runQaChecks({ ...base, shots: [
      { index: 0, durationSec: 3, dialogue: 'a', status: 'DONE' },
      { index: 1, durationSec: 3, dialogue: 'b', status: 'DONE' },
    ] })
    expect(r.status).toBe('WARN')
    expect(r.findings.find((f) => f.id === 'duration')?.severity).toBe('warn')
  })

  it('WARN when a dialogue shot has no subtitle words', () => {
    const r = runQaChecks({ ...base, subtitles: { version: 1, shots: [
      { index: 0, audioSec: 10, words: [{ text: 'привет', startSec: 0, endSec: 1 }] },
      // shot 1 dialogue present but no subtitle entry
    ] } })
    expect(r.status).toBe('WARN')
    expect(r.findings.find((f) => f.id === 'subtitles')?.severity).toBe('warn')
  })

  it('BLOCK outranks WARN in the overall status', () => {
    const r = runQaChecks({ ...base, outputUrl: null, shots: [
      { index: 0, durationSec: 2, dialogue: 'a', status: 'DONE' },
    ] })
    expect(r.status).toBe('BLOCK')
  })

  it('falls back to the instagram band for an unknown/null platform', () => {
    const r = runQaChecks({ ...base, platform: null })
    // does not throw; produces a duration finding
    expect(r.findings.some((f) => f.id === 'duration')).toBe(true)
  })
})
