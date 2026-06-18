import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import { loadFont } from '@remotion/fonts'
import type { StitchChunk, StitchShotProps, VideoStitchProps } from './video-stitch-shared.js'
import { ScreencastShot } from './screencast/ScreencastShot.js'

const SUBTITLE_FONT = 'ContentoInter'

// loadFont uses the browser FontFace API. This module is also imported in plain
// Node (worker imports @contento/brand-kit for types/consts; vitest) and is
// typechecked by consumers whose tsconfig lib has no DOM (e.g. @contento/api,
// which imports TEMPLATE_CONFIG). Probe globalThis instead of the bare `window`
// identifier so the guard needs neither the FontFace API at runtime nor the DOM
// lib at compile time.
const isBrowser = typeof (globalThis as { window?: unknown }).window !== 'undefined'
if (isBrowser) {
  loadFont({
    family: SUBTITLE_FONT,
    url: staticFile('fonts/Inter-Variable.ttf'),
    weight: '100 900',
  }).catch(() => {
    // Font loading must never crash the render; Chromium falls back to sans-serif.
  })
}

function SubtitleChunkView({ chunk, accentColor }: { chunk: StitchChunk; accentColor: string }) {
  const frame = useCurrentFrame() // relative to the chunk's Sequence
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20%',
        left: 60,
        right: 60,
        textAlign: 'center',
        fontFamily: SUBTITLE_FONT,
        fontWeight: 800,
        fontSize: 60,
        lineHeight: 1.3,
        color: '#fff',
        textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)',
      }}
    >
      {chunk.words.map((w, i) => {
        const localStart = w.startFrame - chunk.startFrame
        const localEnd = w.endFrame - chunk.startFrame
        const active = frame >= localStart && frame < localEnd
        return (
          <span key={i} style={{ color: active ? accentColor : '#fff', marginRight: 16 }}>
            {w.text}
          </span>
        )
      })}
    </div>
  )
}

function ShotLayer({
  shot,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  shot: StitchShotProps
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()

  // SYNTHETIC SCREENCAST: no clip; render the screen from structured content.
  if (shot.shotType === 'screencast' && !shot.src && shot.screencastContent) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <ScreencastShot
          content={shot.screencastContent}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          accentColor={accentColor}
        />
        {/* Avatar clips bake audio in; screencast/b-roll carry audioSrc — no double track. */}
        {shot.audioSrc && <Audio src={shot.audioSrc} />}
        {shot.chunks.map((c, i) => (
          <Sequence key={i} from={c.startFrame} durationInFrames={Math.max(1, c.endFrame - c.startFrame)}>
            <SubtitleChunkView chunk={c} accentColor={accentColor} />
          </Sequence>
        ))}
      </AbsoluteFill>
    )
  }

  // VIDEO (avatar / b-roll / uploaded-recording screencast): unchanged clip path.
  // Subtle Ken Burns zoom so static avatar shots don't feel frozen; also applies to looped b-roll.
  const scale = interpolate(frame, [0, Math.max(1, shot.durationInFrames)], [1, 1.04])
  const video = (
    <OffthreadVideo
      src={shot.src!}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
    />
  )
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {shot.clipDurationInFrames != null && shot.clipDurationInFrames < shot.durationInFrames ? (
        // b-roll: loop the short DoP clip to fill the (longer) voiceover.
        <Loop durationInFrames={Math.max(1, shot.clipDurationInFrames)}>{video}</Loop>
      ) : (
        video
      )}
      {/* Avatar clips bake audio into the clip and have no audioSrc; b-roll clips are silent and have audioSrc — no double track. */}
      {shot.audioSrc && <Audio src={shot.audioSrc} />}
      {shot.headline && (
        <div
          style={{
            position: 'absolute',
            top: '14%',
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: SUBTITLE_FONT,
            fontWeight: 800,
            fontSize: 72,
            lineHeight: 1.15,
            color: '#fff',
            textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)',
          }}
        >
          {shot.headline}
        </div>
      )}
      {shot.chunks.map((c, i) => (
        <Sequence key={i} from={c.startFrame} durationInFrames={Math.max(1, c.endFrame - c.startFrame)}>
          <SubtitleChunkView chunk={c} accentColor={accentColor} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

function CtaCard({
  cta,
  primaryColor,
  secondaryColor,
  accentColor,
  logoUrl,
}: {
  cta: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl?: string
}) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  const y = interpolate(frame, [0, 12], [24, 0], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: SUBTITLE_FONT,
        opacity,
      }}
    >
      {logoUrl && <img src={logoUrl} alt="" style={{ height: 110, marginBottom: 56, objectFit: 'contain' }} />}
      <div
        style={{
          color: '#fff',
          fontSize: 76,
          fontWeight: 800,
          textAlign: 'center',
          padding: '0 90px',
          lineHeight: 1.2,
          transform: `translateY(${y}px)`,
        }}
      >
        {cta}
      </div>
      <div style={{ width: 140, height: 8, background: accentColor, borderRadius: 4, marginTop: 56 }} />
    </AbsoluteFill>
  )
}

export function VideoStitch(props: VideoStitchProps) {
  let offset = 0
  const offsets = props.shots.map(s => {
    const o = offset
    offset += s.durationInFrames
    return o
  })
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {props.shots.map((shot, i) => (
        <Sequence key={i} from={offsets[i]!} durationInFrames={shot.durationInFrames}>
          <ShotLayer
              shot={shot}
              primaryColor={props.primaryColor}
              secondaryColor={props.secondaryColor}
              accentColor={props.accentColor}
            />
        </Sequence>
      ))}
      <Sequence from={offset} durationInFrames={props.ctaDurationInFrames}>
        <CtaCard
          cta={props.cta}
          primaryColor={props.primaryColor}
          secondaryColor={props.secondaryColor}
          accentColor={props.accentColor}
          {...(props.logoUrl ? { logoUrl: props.logoUrl } : {})}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
