import { describe, it, expect } from 'vitest'
import { getPlatformProfile, TARGET_PLATFORMS } from './platform-profiles.js'

describe('getPlatformProfile', () => {
  it('TikTok prefers native sound and a 21-34s band with a 3s hook', () => {
    const p = getPlatformProfile('tiktok')
    expect(p.nativeSoundImportance).toBe('high')
    expect(p.targetDurationSec.ideal).toBe(28)
    expect(p.hookWindowSec).toBe(3)
    expect(p.captionStyle).toBe('conversational-trend')
  })
  it('YouTube Shorts uses SEO captions and a tight hook', () => {
    const p = getPlatformProfile('youtube')
    expect(p.captionStyle).toBe('seo-keyword-first')
    expect(p.hookWindowSec).toBe(2)
  })
  it('every profile discloses AIGC', () => {
    for (const pl of TARGET_PLATFORMS) expect(getPlatformProfile(pl).aigcDisclosure).toBe(true)
  })
  it('falls back to instagram for an unknown platform', () => {
    expect(getPlatformProfile('nope').platform).toBe('instagram')
  })
})
