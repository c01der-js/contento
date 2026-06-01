import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: {
    // ESLint plugin packages not installed in this workspace — run separately via pnpm lint
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    // Allow webpack to resolve .js imports as .ts/.tsx (TypeScript ESM convention)
    config.resolve = config.resolve ?? {}
    config.resolve.extensionAlias = {
      ...((config.resolve.extensionAlias as Record<string, string[]>) ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
}

export default withNextIntl(nextConfig)
