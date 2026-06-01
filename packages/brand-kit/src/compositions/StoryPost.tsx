import { AbsoluteFill } from 'remotion'
import type { BrandCardProps } from '../types.js'

export function StoryPost({
  hook,
  caption,
  hashtags,
  primaryColor = '#1a1a2e',
  secondaryColor = '#0d0d1a',
  accentColor = '#e94560',
  fontPrimary = 'Inter',
  logoUrl,
  watermarkUrl,
}: BrandCardProps) {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        fontFamily: fontPrimary,
        color: '#fff',
      }}
    >
      {/* Top safe area — logo */}
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
      {/* Accent stripe */}
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: accentColor }}
      />
      {/* Hook — vertically centered, large */}
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: 80,
          right: 80,
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1.1,
        }}
      >
        {hook}
      </div>
      {/* Caption */}
      <div
        style={{
          position: 'absolute',
          top: '62%',
          left: 80,
          right: 80,
          fontSize: 44,
          lineHeight: 1.5,
          opacity: 0.75,
        }}
      >
        {caption}
      </div>
      {/* Hashtags */}
      <div
        style={{
          position: 'absolute',
          bottom: 200,
          left: 80,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          fontSize: 32,
          opacity: 0.55,
        }}
      >
        {hashtags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {/* Bottom safe zone — watermark */}
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
          }}
        />
      )}
    </AbsoluteFill>
  )
}
