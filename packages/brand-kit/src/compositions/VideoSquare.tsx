import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion'

interface VideoSquareProps {
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

export function VideoSquare({
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
}: VideoSquareProps) {
  const frame = useCurrentFrame()

  const hookOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })
  const hookY = interpolate(frame, [0, 30], [30, 0], { extrapolateRight: 'clamp' })

  const bodyOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bodyY = interpolate(frame, [60, 90], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
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
                'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)',
            }}
          />
        </>
      )}

      {/* Accent bar top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 8,
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
            top: 48,
            left: 60,
            height: 56,
            objectFit: 'contain',
          }}
        />
      )}

      {/* Hook */}
      <div
        style={{
          position: 'absolute',
          top: '22%',
          left: 60,
          right: 60,
          fontSize: 80,
          fontWeight: 900,
          lineHeight: 1.15,
          opacity: hookOpacity,
          transform: `translateY(${hookY}px)`,
        }}
      >
        {hook}
      </div>

      {/* Body */}
      {body && (
        <div
          style={{
            position: 'absolute',
            top: '55%',
            left: 60,
            right: 60,
            fontSize: 40,
            lineHeight: 1.5,
            opacity: bodyOpacity * 0.8,
            transform: `translateY(${bodyY}px)`,
          }}
        >
          {body}
        </div>
      )}

      {/* CTA */}
      {cta && (
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            left: 60,
            right: 60,
            fontSize: 44,
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
            bottom: 48,
            right: 60,
            height: 48,
            opacity: 0.35,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
