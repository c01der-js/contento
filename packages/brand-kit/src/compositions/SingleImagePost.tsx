import { AbsoluteFill } from 'remotion'
import { BrandCard } from '../components/BrandCard.js'
import type { BrandCardProps } from '../types.js'

export function SingleImagePost(props: BrandCardProps) {
  return (
    <AbsoluteFill>
      <BrandCard {...props} />
    </AbsoluteFill>
  )
}
