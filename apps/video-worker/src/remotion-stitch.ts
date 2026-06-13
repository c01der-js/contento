import { fileURLToPath } from 'url'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { VIDEO_STITCH_ID, type VideoStitchProps } from '@contento/brand-kit'

// Same relative depth as render-worker: dist/remotion-stitch.js (or src/ in tsx dev)
// -> ../../../ = repo root.
const REMOTION_ENTRY = fileURLToPath(
  new URL('../../../packages/brand-kit/src/remotion-entry.ts', import.meta.url),
)
const REMOTION_PUBLIC_DIR = fileURLToPath(
  new URL('../../../packages/brand-kit/public', import.meta.url),
)

let bundlePromise: Promise<string> | null = null

/** Webpack-bundle the Remotion project once per process; reset on failure. */
function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: REMOTION_ENTRY,
      publicDir: REMOTION_PUBLIC_DIR,
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
  const composition = await selectComposition({ serveUrl, id: VIDEO_STITCH_ID, inputProps })
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    outputLocation: outputPath,
    inputProps,
    // Remote clip fetches (presigned S3) can take a while on first frame.
    timeoutInMilliseconds: 180_000,
  })
}
