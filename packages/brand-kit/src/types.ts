export interface BrandCardProps {
  hook: string
  caption: string
  hashtags: string[]
  primaryColor?: string      // hex, default '#1a1a2e'
  secondaryColor?: string    // hex, default '#16213e'
  accentColor?: string       // hex, default '#0f3460'
  fontPrimary?: string       // font family name, default 'Inter'
  logoUrl?: string           // image URL
  watermarkUrl?: string      // image URL (bottom-right overlay)
  format?: 'square' | 'portrait' | 'landscape'  // default 'square'
}
