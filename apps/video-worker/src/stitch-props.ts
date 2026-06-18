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
 *
 * Word timings are sanitized defensively: words with non-finite startSec/endSec
 * (corrupt/legacy persisted JSON) are dropped so they cannot poison the frame
 * math into a NaN Sequence duration; words that start beyond the (possibly
 * trimmed) shot are dropped rather than clamped onto the final frame (which would
 * bunch overflow subtitles); and every kept word holds at least one frame so the
 * karaoke highlight always fires.
 */
export function buildShotProps(
  src: string,
  probedSec: number,
  timing?: ShotTimingJson,
  extra?: { audioSrc?: string; headline?: string; clipProbedSec?: number },
): StitchShotProps {
  const validWords = (timing?.words ?? []).filter(
    w => typeof w.text === 'string' && Number.isFinite(w.startSec) && Number.isFinite(w.endSec),
  )
  const lastWordEnd = validWords.length > 0 ? validWords[validWords.length - 1]!.endSec : 0
  const trimmedSec = lastWordEnd > 0 ? Math.min(probedSec, lastWordEnd + TRIM_PADDING_SEC) : probedSec
  const durationInFrames = Math.max(1, Math.round(trimmedSec * STITCH_FPS))
  const words: StitchWord[] = validWords
    .map(w => ({
      text: w.text,
      startFrame: Math.round(w.startSec * STITCH_FPS),
      endFrame: Math.round(w.endSec * STITCH_FPS),
    }))
    .filter(w => w.startFrame < durationInFrames)
    .map(w => {
      const startFrame = Math.max(0, Math.min(w.startFrame, durationInFrames - 1))
      return {
        text: w.text,
        startFrame,
        endFrame: Math.min(Math.max(w.endFrame, startFrame + 1), durationInFrames),
      }
    })
  const chunks = chunkWords(words)
  for (const chunk of chunks) chunk.endFrame = Math.min(chunk.endFrame, durationInFrames)
  const clipDurationInFrames =
    extra?.clipProbedSec != null ? Math.max(1, Math.round(extra.clipProbedSec * STITCH_FPS)) : undefined
  return {
    src,
    durationInFrames,
    chunks,
    ...(extra?.audioSrc ? { audioSrc: extra.audioSrc } : {}),
    ...(extra?.headline ? { headline: extra.headline } : {}),
    ...(clipDurationInFrames != null ? { clipDurationInFrames } : {}),
  }
}

export interface StitchShotInput {
  src: string
  probedSec: number
  timing?: ShotTimingJson
  audioSrc?: string
  headline?: string
  /** Natural length of the clip if it differs from `probedSec` (b-roll loops to fill the voiceover). */
  clipProbedSec?: number
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
    shots: input.shots.map(s =>
      buildShotProps(s.src, s.probedSec, s.timing, {
        ...(s.audioSrc ? { audioSrc: s.audioSrc } : {}),
        ...(s.headline ? { headline: s.headline } : {}),
        ...(s.clipProbedSec != null ? { clipProbedSec: s.clipProbedSec } : {}),
      }),
    ),
    cta: input.cta,
    ctaDurationInFrames: d.ctaDurationInFrames,
    primaryColor: input.visual?.primaryColor ?? d.primaryColor,
    secondaryColor: input.visual?.secondaryColor ?? d.secondaryColor,
    accentColor: input.visual?.accentColor ?? d.accentColor,
    ...(input.visual?.logoUrl ? { logoUrl: input.visual.logoUrl } : {}),
  }
}
