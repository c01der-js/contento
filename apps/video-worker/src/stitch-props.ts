import type { StitchChunk, StitchShotProps, StitchWord, VideoStitchProps } from '@contento/brand-kit'
import { DEFAULT_VIDEO_STITCH_PROPS, VIDEO_STITCH_FPS } from '@contento/brand-kit'

export const STITCH_FPS = VIDEO_STITCH_FPS

/** Per-shot timings as persisted in Script.subtitles (version 1). */
export interface ShotTimingJson {
  index: number
  audioSec: number
  words: Array<{ text: string; startSec: number; endSec: number }>
}

export interface SubtitlesJson {
  version: 1
  shots: ShotTimingJson[]
}

/** Defensive parse of the Script.subtitles Json column. Undefined on any mismatch. */
export function parseSubtitlesJson(value: unknown): SubtitlesJson | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as { version?: unknown; shots?: unknown }
  if (v.version !== 1 || !Array.isArray(v.shots)) return undefined
  for (const s of v.shots as unknown[]) {
    const shot = s as { index?: unknown; audioSec?: unknown; words?: unknown }
    if (typeof shot.index !== 'number' || !Array.isArray(shot.words)) return undefined
  }
  return value as SubtitlesJson
}

/**
 * Group word timings into subtitle chunks (phrases). A chunk breaks on
 * maxWords or on a pause longer than maxGapFrames. Each chunk stays on screen
 * until the next one starts (or +6 frames for the last one).
 */
export function chunkWords(words: StitchWord[], maxWords = 4, maxGapFrames = 24): StitchChunk[] {
  const chunks: StitchChunk[] = []
  let current: StitchWord[] = []
  const flush = () => {
    if (current.length === 0) return
    chunks.push({
      startFrame: current[0]!.startFrame,
      endFrame: current[current.length - 1]!.endFrame,
      words: current,
    })
    current = []
  }
  for (const word of words) {
    const prev = current[current.length - 1]
    if (current.length >= maxWords || (prev && word.startFrame - prev.endFrame > maxGapFrames)) flush()
    current.push(word)
  }
  flush()
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1]
    chunks[i]!.endFrame = next ? next.startFrame : chunks[i]!.endFrame + 6
  }
  return chunks
}

/** Extra tail kept after the last spoken word, so the cut isn't mid-gesture. */
const TRIM_PADDING_SEC = 0.4

/**
 * Build one shot's props: trim the frozen tail of Speak clips (clip length is
 * bucketed 5/10/15s while speech may end earlier) and convert word timings to
 * frames relative to the shot start, clamped into the trimmed duration.
 */
export function buildShotProps(src: string, probedSec: number, timing?: ShotTimingJson): StitchShotProps {
  const lastWordEnd = timing && timing.words.length > 0 ? timing.words[timing.words.length - 1]!.endSec : 0
  const trimmedSec = lastWordEnd > 0 ? Math.min(probedSec, lastWordEnd + TRIM_PADDING_SEC) : probedSec
  const durationInFrames = Math.max(1, Math.round(trimmedSec * STITCH_FPS))
  const words: StitchWord[] = (timing?.words ?? []).map(w => ({
    text: w.text,
    startFrame: Math.min(Math.round(w.startSec * STITCH_FPS), durationInFrames - 1),
    endFrame: Math.min(Math.round(w.endSec * STITCH_FPS), durationInFrames),
  }))
  const chunks = chunkWords(words)
  for (const chunk of chunks) chunk.endFrame = Math.min(chunk.endFrame, durationInFrames)
  return { src, durationInFrames, chunks }
}

export interface StitchShotInput {
  src: string
  probedSec: number
  timing?: ShotTimingJson
}

export interface VisualIdentityColors {
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  logoUrl: string | null
}

export function buildStitchProps(input: {
  shots: StitchShotInput[]
  cta: string
  visual?: VisualIdentityColors | null
}): VideoStitchProps {
  const d = DEFAULT_VIDEO_STITCH_PROPS
  return {
    shots: input.shots.map(s => buildShotProps(s.src, s.probedSec, s.timing)),
    cta: input.cta,
    ctaDurationInFrames: d.ctaDurationInFrames,
    primaryColor: input.visual?.primaryColor ?? d.primaryColor,
    secondaryColor: input.visual?.secondaryColor ?? d.secondaryColor,
    accentColor: input.visual?.accentColor ?? d.accentColor,
    ...(input.visual?.logoUrl ? { logoUrl: input.visual.logoUrl } : {}),
  }
}
