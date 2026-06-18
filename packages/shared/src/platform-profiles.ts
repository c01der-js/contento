// Static per-platform content profiles (RU-speaking diaspora + CIS). Values from the
// 2026 platform research synthesis. Drives length, caption style, hook, and AIGC
// disclosure so each platform gets a tailored video. Code-defined (not user-editable) for MVP.
export type TargetPlatform = 'tiktok' | 'instagram' | 'youtube' | 'telegram'

export interface PlatformProfile {
  platform: TargetPlatform
  targetDurationSec: { min: number; ideal: number; max: number }
  hookWindowSec: number
  captionStyle: 'seo-keyword-first' | 'conversational-trend'
  hashtagCount: number
  captionMaxLen: number
  nativeSoundImportance: 'high' | 'low'
  aigcDisclosure: true
  formatMix: { avatar: number; broll: number; screencast: number } // weights, sum = 1
}

const PROFILES: Record<TargetPlatform, PlatformProfile> = {
  tiktok: {
    platform: 'tiktok', targetDurationSec: { min: 21, ideal: 28, max: 34 }, hookWindowSec: 3,
    captionStyle: 'conversational-trend', hashtagCount: 4, captionMaxLen: 2200,
    nativeSoundImportance: 'high', aigcDisclosure: true,
    formatMix: { avatar: 0.7, broll: 0.2, screencast: 0.1 },
  },
  instagram: {
    platform: 'instagram', targetDurationSec: { min: 15, ideal: 20, max: 30 }, hookWindowSec: 3,
    captionStyle: 'seo-keyword-first', hashtagCount: 5, captionMaxLen: 2200,
    nativeSoundImportance: 'low', aigcDisclosure: true,
    formatMix: { avatar: 0.4, broll: 0.4, screencast: 0.2 },
  },
  youtube: {
    platform: 'youtube', targetDurationSec: { min: 20, ideal: 28, max: 35 }, hookWindowSec: 2,
    captionStyle: 'seo-keyword-first', hashtagCount: 3, captionMaxLen: 100,
    nativeSoundImportance: 'low', aigcDisclosure: true,
    formatMix: { avatar: 0.6, broll: 0.3, screencast: 0.1 },
  },
  telegram: {
    platform: 'telegram', targetDurationSec: { min: 20, ideal: 30, max: 45 }, hookWindowSec: 3,
    captionStyle: 'conversational-trend', hashtagCount: 3, captionMaxLen: 1024,
    nativeSoundImportance: 'low', aigcDisclosure: true,
    formatMix: { avatar: 0.5, broll: 0.3, screencast: 0.2 },
  },
}

export const TARGET_PLATFORMS: TargetPlatform[] = ['tiktok', 'instagram', 'youtube', 'telegram']

/** Profile for a platform; falls back to instagram for unknown/legacy values. */
export function getPlatformProfile(platform: string): PlatformProfile {
  return PROFILES[platform as TargetPlatform] ?? PROFILES.instagram
}
