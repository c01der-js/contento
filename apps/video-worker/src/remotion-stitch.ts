import { createRequire } from 'module'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { VIDEO_STITCH_ID, type VideoStitchProps } from '@contento/brand-kit'

let bundlePromise: Promise<string> | null = null

/**
 * Resolve the brand-kit package directory via Node module resolution rather than a
 * hand-counted relative depth. The worker's compiled output is NESTED
 * (dist/apps/video-worker/src/), so a literal '../../../packages/brand-kit' would
 * point at a non-existent path under dist and only happen to work under tsx dev.
 * Resolving '@contento/brand-kit/package.json' yields the real package location in
 * both modes; the bundler then reads the TypeScript source directly.
 */
function resolveBrandKit(): { entry: string; publicDir: string } {
  const require_ = createRequire(import.meta.url)
  const pkgDir = dirname(require_.resolve('@contento/brand-kit/package.json'))
  const entry = join(pkgDir, 'src/remotion-entry.ts')
  const publicDir = join(pkgDir, 'public')
  for (const [label, p] of [['entry', entry], ['public dir', publicDir]] as const) {
    if (!existsSync(p)) throw new Error(`remotion-stitch: brand-kit ${label} not found at ${p}`)
  }
  return { entry, publicDir }
}

/** Webpack-bundle the Remotion project once per process; reset on failure. */
function getBundle(): Promise<string> {
  if (!bundlePromise) {
    const { entry, publicDir } = resolveBrandKit()
    bundlePromise = bundle({
      entryPoint: entry,
      publicDir,
      // brand-kit sources use NodeNext './x.js' imports. Resolve those to the
      // .tsx/.ts source FIRST so a stray compiled .js can never shadow it (a
      // stale src/remotion-root.js once silently dropped the VideoStitch
      // composition from the bundle).
      webpackOverride: config => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ...(config.resolve?.extensionAlias ?? {}),
            '.js': ['.tsx', '.ts', '.jsx', '.js'],
          },
        },
      }),
    }).catch(err => {
      bundlePromise = null
      throw err
    })
  }
  return bundlePromise
}

export async function renderStitchVideo(props: VideoStitchProps, outputPath: string): Promise<void> {
  const serveUrl = await getBundle()
  const inputProps = props as unknown as Record<string, unknown>
  // On Alpine, point Remotion at the system (musl-native) Chromium via
  // REMOTION_BROWSER_EXECUTABLE instead of its glibc chrome-headless-shell.
  // Unset elsewhere (null) → Remotion's default downloaded browser.
  const browserExecutable = process.env['REMOTION_BROWSER_EXECUTABLE'] || null
  const composition = await selectComposition({ serveUrl, id: VIDEO_STITCH_ID, inputProps, browserExecutable })
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    outputLocation: outputPath,
    inputProps,
    browserExecutable,
    // Remote clip fetches (presigned S3) can take a while on first frame.
    timeoutInMilliseconds: 180_000,
  })
}
