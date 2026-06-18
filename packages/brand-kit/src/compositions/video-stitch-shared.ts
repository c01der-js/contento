/** One word of a burned-in subtitle, frames relative to the START OF ITS SHOT. */
export interface StitchWord {
  text: string
  startFrame: number
  endFrame: number
}

/** A subtitle phrase shown as one block; frames relative to the shot start. */
export interface StitchChunk {
  startFrame: number
  endFrame: number
  words: StitchWord[]
}

export interface StitchShotProps {
  /** URL fetchable by the renderer (presigned S3 or public). */
  src: string
  /** Trimmed shot length in frames (may be shorter than the source clip). */
  durationInFrames: number
  chunks: StitchChunk[]
  /** Voiceover track for non-avatar shots (avatar audio is baked into `src`). */
  audioSrc?: string
  /** On-screen headline for b-roll shots. */
  headline?: string
  /** Natural length of `src` in frames; when set and shorter than durationInFrames, the clip loops. */
  clipDurationInFrames?: number
}

export interface VideoStitchProps {
  shots: StitchShotProps[]
  cta: string
  ctaDurationInFrames: number
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl?: string
}

export const VIDEO_STITCH_FPS = 30
export const VIDEO_STITCH_ID = 'VideoStitch'

export const DEFAULT_VIDEO_STITCH_PROPS: VideoStitchProps = {
  shots: [],
  cta: 'Подпишись',
  ctaDurationInFrames: 75,
  primaryColor: '#1a1a2e',
  secondaryColor: '#0d0d1a',
  accentColor: '#e94560',
}

export function calcStitchDurationInFrames(props: VideoStitchProps): number {
  const shotFrames = props.shots.reduce((sum, s) => sum + s.durationInFrames, 0)
  return Math.max(1, shotFrames + props.ctaDurationInFrames)
}
