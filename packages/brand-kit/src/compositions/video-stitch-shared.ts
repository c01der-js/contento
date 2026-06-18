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

export type ScreencastTemplate = 'slides' | 'chat' | 'browser' | 'phone-app'

export interface SlidesContent { template: 'slides'; title: string; bullets: string[] }
export interface ChatContent { template: 'chat'; messages: { side: 'left' | 'right'; text: string }[] }
export interface BrowserContent { template: 'browser'; url: string; title: string; lines: string[] }
export interface PhoneAppContent { template: 'phone-app'; appName: string; items: string[] }
export type ScreencastContent = SlidesContent | ChatContent | BrowserContent | PhoneAppContent

export interface StitchShotProps {
  /** Video URL (avatar/b-roll/uploaded-recording). Absent for synthetic screencast shots. */
  src?: string
  /** Shot kind; absent/'video' renders the clip path, 'screencast' renders a synthetic screen. */
  shotType?: 'video' | 'screencast'
  /** Trimmed shot length in frames. */
  durationInFrames: number
  chunks: StitchChunk[]
  /** Voiceover track for non-avatar shots (avatar audio is baked into `src`). */
  audioSrc?: string
  /** On-screen headline for b-roll shots. */
  headline?: string
  /** Natural length of `src` in frames; when set and shorter than durationInFrames, the clip loops. */
  clipDurationInFrames?: number
  /** Synthetic screen template (when shotType==='screencast' and there is no `src`). */
  screencastTemplate?: ScreencastTemplate
  /** Structured content for the synthetic screen. */
  screencastContent?: ScreencastContent
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
