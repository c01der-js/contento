import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import type { ChatContent } from '../video-stitch-shared.js'

const FONT = 'ContentoInter'

export function ChatScreen({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: ChatContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: FONT,
        color: '#fff',
        padding: 80,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 28,
      }}
    >
      {content.messages.map((m, i) => {
        const appear = interpolate(frame, [20 * i, 20 * i + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const mine = m.side === 'right'
        return (
          <div
            key={i}
            style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              background: mine ? accentColor : 'rgba(255,255,255,0.14)',
              color: '#fff',
              fontSize: 46,
              lineHeight: 1.3,
              padding: '28px 36px',
              borderRadius: 36,
              borderBottomRightRadius: mine ? 8 : 36,
              borderBottomLeftRadius: mine ? 36 : 8,
              opacity: appear,
              transform: `translateY(${(1 - appear) * 24}px)`,
            }}
          >
            {m.text}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
