import { AbsoluteFill } from 'remotion'
import type { BrandCardProps } from '../types.js'

export function QuotePost({
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
        background: `linear-gradient(160deg, ${primaryColor}, ${secondaryColor})`,
        fontFamily: fontPrimary,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      {/* Opening quote mark */}
      <div
        style={{
          fontSize: 160,
          lineHeight: 0.7,
          color: accentColor,
          alignSelf: 'flex-start',
          marginBottom: 32,
        }}
      >
        "
      </div>
      {/* Hook as quote */}
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.25,
          textAlign: 'center',
          marginBottom: 48,
        }}
      >
        {hook}
      </div>
      {/* Caption as attribution */}
      <div style={{ fontSize: 32, opacity: 0.7, textAlign: 'center' }}>{caption}</div>
      {/* Hashtags */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          display: 'flex',
          gap: 12,
          fontSize: 24,
          opacity: 0.5,
        }}
      >
        {hashtags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {watermarkUrl && (
        <img
          src={watermarkUrl}
          alt=""
          style={{
            position: 'absolute',
            bottom: 40,
            right: 60,
            height: 40,
            opacity: 0.3,
          }}
        />
      )}
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 40,
            right: 60,
            height: 56,
            objectFit: 'contain',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
