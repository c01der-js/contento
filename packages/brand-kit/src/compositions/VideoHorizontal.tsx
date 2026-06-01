import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion'

interface VideoHorizontalProps {
  hook: string
  body?: string
  cta?: string
  caption?: string
  hashtags?: string[]
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  fontPrimary?: string
  watermarkUrl?: string
  logoUrl?: string
  backgroundVideoUrl?: string
}

export function VideoHorizontal({
  hook,
  body,
  cta,
  primaryColor = '#1a1a2e',
  secondaryColor = '#16213e',
  accentColor = '#0f3460',
  fontPrimary = 'Inter',
  watermarkUrl,
  logoUrl,
  backgroundVideoUrl,
}: VideoHorizontalProps) {
  const frame = useCurrentFrame()

  const hookOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })
  const hookX = interpolate(frame, [0, 30], [-40, 0], { extrapolateRight: 'clamp' })

  const bodyOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bodyX = interpolate(frame, [60, 90], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(frame, [300, 330], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(120deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        fontFamily: fontPrimary,
        color: '#fff',
      }}
    >
      {backgroundVideoUrl && (
        <>
          <OffthreadVideo
            src={backgroundVideoUrl}
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(120deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%)',
            }}
          />
        </>
      )}

      {/* Left accent stripe */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 8,
          bottom: 0,
          background: accentColor,
        }}
      />

      {/* Logo top-left */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 60,
            left: 80,
            height: 64,
            objectFit: 'contain',
          }}
        />
      )}

      {/* Hook — left-aligned, vertically centered upper half */}
      <div
        style={{
          position: 'absolute',
          top: '25%',
          left: 80,
          right: '45%',
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1.1,
          opacity: hookOpacity,
          transform: `translateX(${hookX}px)`,
        }}
      >
        {hook}
      </div>

      {/* Body — right panel */}
      {body && (
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '55%',
            right: 80,
            fontSize: 42,
            lineHeight: 1.6,
            opacity: bodyOpacity * 0.8,
            transform: `translateX(${bodyX}px)`,
          }}
        >
          {body}
        </div>
      )}

      {/* CTA bottom-left */}
      {cta && (
        <div
          style={{
            position: 'absolute',
            bottom: 100,
            left: 80,
            fontSize: 52,
            fontWeight: 700,
            color: accentColor,
            opacity: ctaOpacity,
          }}
        >
          {cta}
        </div>
      )}

      {/* Watermark bottom-right */}
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt=""
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            height: 52,
            opacity: 0.35,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
