import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { SlidesContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function SlidesScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: SlidesContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  // Reveal one bullet roughly every 18 frames (~0.6s at 30fps).
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: FONT,
        color: '#fff',
        padding: 96,
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 140, height: 10, background: accentColor, borderRadius: 4, marginBottom: 40 }} />
      <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.1, marginBottom: 56 }}>{content.title}</div>
      {content.bullets.map((b, i) => {
        const appear = interpolate(frame, [18 * i, 18 * i + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return (
          <div
            key={i}
            style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.4, marginBottom: 28, opacity: appear, transform: `translateX(${(1 - appear) * 40}px)`, display: 'flex', gap: 24 }}
          >
            <span style={{ color: accentColor }}>{'•'}</span>
            <span>{b}</span>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
