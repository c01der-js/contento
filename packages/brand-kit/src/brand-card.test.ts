import { describe, it, expect } from 'vitest'
import type { BrandCardProps } from './types.js'

describe('BrandCardProps', () => {
  it('requires hook, caption, hashtags', () => {
    const props: BrandCardProps = {
      hook: 'Test hook',
      caption: 'Test caption',
      hashtags: ['test'],
    }
    expect(props.hook).toBe('Test hook')
    expect(props.hashtags).toHaveLength(1)
  })

  it('accepts all optional fields', () => {
    const props: BrandCardProps = {
      hook: 'Hook',
      caption: 'Caption',
      hashtags: [],
      primaryColor: '#000000',
      secondaryColor: '#111111',
      accentColor: '#222222',
      fontPrimary: 'Inter',
      logoUrl: 'https://example.com/logo.png',
      watermarkUrl: 'https://example.com/watermark.png',
      format: 'square',
    }
    expect(props.format).toBe('square')
  })
})
