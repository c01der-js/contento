import { AbsoluteFill } from 'remotion'
import type { BrandCardProps } from '../types.js'

export function NewsCard({
  hook,
  caption,
  hashtags,
  primaryColor = '#0a0a0a',
  secondaryColor = '#111',
  accentColor = '#e94560',
  fontPrimary = 'Inter',
  logoUrl,
  watermarkUrl,
}: BrandCardProps) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${primaryColor} 60%, ${secondaryColor})`, fontFamily: fontPrimary, color: '#fff' }}>
      {/* Top bar */}
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: accentColor }}
      />
      {/* BREAKING label */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 60,
          background: accentColor,
          color: '#fff',
          padding: '8px 20px',
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        BREAKING
      </div>
      {/* Headline */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 60,
          right: 60,
          fontSize: 80,
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
          top: 640,
          left: 60,
          right: 60,
          fontSize: 40,
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
          bottom: 80,
          left: 60,
          display: 'flex',
          gap: 12,
          fontSize: 28,
          opacity: 0.55,
          flexWrap: 'wrap',
        }}
      >
        {hashtags.slice(0, 4).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          style={{
            position: 'absolute',
            bottom: 80,
            right: 60,
            height: 60,
            objectFit: 'contain',
            opacity: 0.8,
          }}
        />
      )}
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 40,
            right: 60,
            height: 40,
            opacity: 0.3,
          }}
        />
      )}
    </AbsoluteFill>
  )
}
