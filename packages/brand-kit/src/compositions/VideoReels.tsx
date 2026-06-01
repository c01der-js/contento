import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion'

interface VideoReelsProps {
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

export function VideoReels({
  hook,
  body,
  cta,
  primaryColor = '#1a1a2e',
  secondaryColor = '#0d0d1a',
  accentColor = '#e94560',
  fontPrimary = 'Inter',
  watermarkUrl,
  logoUrl,
  backgroundVideoUrl,
}: VideoReelsProps) {
  const frame = useCurrentFrame()

  const hookOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })
  const hookY = interpolate(frame, [0, 30], [40, 0], { extrapolateRight: 'clamp' })

  const bodyOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bodyY = interpolate(frame, [60, 90], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(frame, [300, 330], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ctaY = interpolate(frame, [300, 330], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        fontFamily: fontPrimary,
        color: '#fff',
      }}
    >
      {/* Background video (optional) */}
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
          {/* Dark overlay so text stays readable */}
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.7) 100%)',
            }}
          />
        </>
      )}

      {/* Accent stripe top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
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
            top: 120,
            left: 80,
            height: 64,
            objectFit: 'contain',
          }}
        />
      )}

      {/* Hook — frames 0-30 fade in */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: 80,
          right: 80,
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1.1,
          opacity: hookOpacity,
          transform: `translateY(${hookY}px)`,
        }}
      >
        {hook}
      </div>

      {/* Body — frames 60-240 */}
      {body && (
        <div
          style={{
            position: 'absolute',
            top: '58%',
            left: 80,
            right: 80,
            fontSize: 44,
            lineHeight: 1.5,
            opacity: bodyOpacity * 0.85,
            transform: `translateY(${bodyY}px)`,
          }}
        >
          {body}
        </div>
      )}

      {/* CTA — frames 300-360 */}
      {cta && (
        <div
          style={{
            position: 'absolute',
            bottom: 200,
            left: 80,
            right: 80,
            fontSize: 52,
            fontWeight: 700,
            color: accentColor,
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
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
            bottom: 100,
            right: 80,
            height: 56,
            opacity: 0.35,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
