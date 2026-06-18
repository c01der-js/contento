import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { BrowserContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function BrowserScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: BrowserContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`, fontFamily: FONT, padding: 64, justifyContent: 'center' }}>
      <div style={{ background: '#fff', color: '#111', borderRadius: 28, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {/* Chrome bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '28px 32px', background: '#ececf0' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#ff5f57' }} />
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#febc2e' }} />
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#28c840' }} />
          <div style={{ flex: 1, marginLeft: 20, background: '#fff', borderRadius: 18, padding: '16px 28px', fontSize: 34, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {content.url}
          </div>
        </div>
        {/* Page */}
        <div style={{ padding: 56 }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, marginBottom: 40, color: '#111' }}>{content.title}</div>
          <div style={{ width: 120, height: 8, background: accentColor, borderRadius: 4, marginBottom: 40 }} />
          {content.lines.map((l, i) => {
            const appear = interpolate(frame, [16 * i, 16 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return (
              <div key={i} style={{ fontSize: 42, lineHeight: 1.5, color: '#333', marginBottom: 22, opacity: appear }}>
                {l}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
