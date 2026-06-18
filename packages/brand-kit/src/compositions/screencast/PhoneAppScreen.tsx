import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { PhoneAppContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function PhoneAppScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: PhoneAppContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`, fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 760, height: 1480, background: '#0f0f14', borderRadius: 72, border: '12px solid #2a2a33', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* App header */}
        <div style={{ background: accentColor, color: '#fff', padding: '56px 40px 32px', fontSize: 48, fontWeight: 800 }}>{content.appName}</div>
        {/* Feed */}
        <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {content.items.map((it, i) => {
            const appear = interpolate(frame, [18 * i, 18 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 28, padding: 36, fontSize: 42, color: '#fff', lineHeight: 1.3, opacity: appear, transform: `translateY(${(1 - appear) * 24}px)`, display: 'flex', gap: 24, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: accentColor, flexShrink: 0 }} />
                <span>{it}</span>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
