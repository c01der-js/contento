import { AbsoluteFill } from 'remotion'
import type { BrandCardProps } from '../types.js'

// Landscape 16:9 variant of SingleImagePost (1920×1080).
// Text is split into a left-panel hook and right-panel caption layout.
export function SingleImagePost16x9({
  hook,
  caption,
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
        background: `linear-gradient(120deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        fontFamily: fontPrimary,
        color: '#fff',
      }}
    >
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
            top: 56,
            left: 80,
            height: 64,
            objectFit: 'contain',
          }}
        />
      )}

      {/* Hook — left panel, vertically centered */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: 80,
          right: '50%',
          fontSize: 96,
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-1px',
        }}
      >
        {hook}
      </div>

      {/* Caption — right panel */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: '54%',
          right: 80,
          fontSize: 40,
          lineHeight: 1.6,
          opacity: 0.8,
        }}
      >
        {caption}
      </div>

      {/* Hashtags bottom-left */}
      <div
        style={{
          position: 'absolute',
          bottom: 56,
          left: 80,
          display: 'flex',
          gap: 12,
          fontSize: 28,
          opacity: 0.55,
        }}
      >
        {hashtags.slice(0, 5).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>

      {/* Watermark bottom-right */}
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt=""
          style={{
            position: 'absolute',
            bottom: 48,
            right: 80,
            height: 48,
            opacity: 0.4,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
