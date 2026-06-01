'use client'

import type { BrandCardProps } from '../types.js'

const SIZES = {
  square:    { width: 1080, height: 1080 },
  portrait:  { width: 1080, height: 1350 },
  landscape: { width: 1920, height: 1080 },
}

export function BrandCard({
  hook,
  caption,
  hashtags,
  primaryColor = '#1a1a2e',
  secondaryColor = '#16213e',
  accentColor = '#0f3460',
  fontPrimary = 'Inter',
  logoUrl,
  watermarkUrl,
  format = 'square',
}: BrandCardProps) {
  const { width, height } = SIZES[format]
  const scale = 400 / width   // always render at 400px wide for preview

  return (
    <div
      style={{
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: fontPrimary,
        color: '#ffffff',
        flexShrink: 0,
      }}
    >
      {/* Accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: accentColor }} />

      {/* Logo */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt="logo"
          style={{ position: 'absolute', top: 32, left: 48, height: 64, objectFit: 'contain' }}
        />
      )}

      {/* Hook text */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: 48,
        right: 48,
        fontSize: 72,
        fontWeight: 800,
        lineHeight: 1.15,
        letterSpacing: '-1px',
      }}>
        {hook}
      </div>

      {/* Caption */}
      <div style={{
        position: 'absolute',
        bottom: 180,
        left: 48,
        right: 48,
        fontSize: 36,
        lineHeight: 1.5,
        opacity: 0.85,
      }}>
        {caption}
      </div>

      {/* Hashtags */}
      <div style={{
        position: 'absolute',
        bottom: 80,
        left: 48,
        right: 48,
        fontSize: 28,
        opacity: 0.6,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        {hashtags.slice(0, 5).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>

      {/* Watermark */}
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt="watermark"
          style={{ position: 'absolute', bottom: 32, right: 48, height: 48, opacity: 0.4, objectFit: 'contain' }}
        />
      )}
    </div>
  )
}
