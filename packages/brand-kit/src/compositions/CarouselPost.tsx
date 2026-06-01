import { AbsoluteFill } from 'remotion'
import type { BrandCardProps } from '../types.js'

export function CarouselPost({
  hook,
  hashtags,
  primaryColor = '#1a1a2e',
  secondaryColor = '#16213e',
  accentColor = '#0f3460',
  fontPrimary = 'Inter',
  logoUrl,
  watermarkUrl,
}: BrandCardProps) {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: fontPrimary,
        color: '#fff',
      }}
    >
      {/* Slide indicator top-right */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          right: 60,
          display: 'flex',
          gap: 10,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: i === 0 ? 32 : 12,
              height: 12,
              borderRadius: 6,
              background: i === 0 ? accentColor : 'rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </div>
      {/* Slide 1 label */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 60,
          fontSize: 28,
          opacity: 0.5,
          letterSpacing: 2,
        }}
      >
        01 / INTRO
      </div>
      {/* Hook */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: 60,
          right: 60,
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        {hook}
      </div>
      {/* Swipe hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: 60,
          right: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 30,
          opacity: 0.55,
        }}
      >
        <span>Swipe for more</span>
        <span>→</span>
      </div>
      {/* Hashtags */}
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          left: 60,
          display: 'flex',
          gap: 10,
          fontSize: 24,
          opacity: 0.5,
        }}
      >
        {hashtags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 44,
            right: 60,
            height: 56,
            objectFit: 'contain',
          }}
        />
      )}
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt=""
          style={{
            position: 'absolute',
            bottom: 44,
            right: 60,
            height: 44,
            opacity: 0.4,
          }}
        />
      )}
    </AbsoluteFill>
  )
}
