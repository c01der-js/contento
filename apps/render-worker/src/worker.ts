import { Worker } from 'bullmq'
import { renderStill, selectComposition } from '@remotion/renderer'
import { bundle } from '@remotion/bundler'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlink } from 'fs/promises'
import { prisma } from '@contento/db'
import { getTemplateConfig } from '@contento/brand-kit'
import { uploadFile } from './s3-client.js'

export interface RenderJobPayload {
  renderJobId: string
  scriptId: string
  workspaceId: string
}

const RENDER_TIMEOUT_MS = Number(process.env['RENDER_TIMEOUT_MS'] ?? 15 * 60 * 1000)
const REMOTION_ENTRY = fileURLToPath(
  new URL('../../../packages/brand-kit/src/remotion-entry.ts', import.meta.url),
)

let bundlePromise: Promise<string> | null = null

function getBundleUrl(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: REMOTION_ENTRY,
      onProgress: (p) => {
        if (p === 100) console.log('[render-worker] Remotion bundle ready')
      },
      // brand-kit sources use NodeNext './x.js' imports — resolve them to the
      // .tsx/.ts source first so a stray compiled .js can never shadow it.
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          extensionAlias: {
            ...(config.resolve?.extensionAlias ?? {}),
            '.js': ['.tsx', '.ts', '.jsx', '.js'],
          },
        },
      }),
    }).catch((err) => {
      // Reset so the next job retries the bundle; do not poison the cache.
      bundlePromise = null
      throw err
    })
  }
  return bundlePromise
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export function createWorker(redisUrl: string) {
  const connection = { url: redisUrl }

  return new Worker<RenderJobPayload>(
    'render',
    async (job) => {
      const { renderJobId, scriptId, workspaceId } = job.data

      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { status: 'PROCESSING', ...(job.id !== undefined ? { bullJobId: job.id } : {}) },
      })

      const [script, visualIdentity, renderJob] = await Promise.all([
        prisma.script.findUnique({ where: { id: scriptId } }),
        prisma.visualIdentity.findUnique({ where: { workspaceId } }),
        prisma.renderJob.findUnique({ where: { id: renderJobId } }),
      ])

      if (!script) throw new Error(`Script ${scriptId} not found`)

      const templateId = renderJob?.templateId ?? 'SingleImagePost'
      const templateCfg = getTemplateConfig(templateId)

      const props = {
        hook: script.hook,
        caption: script.caption,
        hashtags: script.hashtags,
        primaryColor: visualIdentity?.primaryColor ?? '#1a1a2e',
        secondaryColor: visualIdentity?.secondaryColor ?? '#16213e',
        accentColor: visualIdentity?.accentColor ?? '#0f3460',
        fontPrimary: visualIdentity?.fontPrimary ?? 'Inter',
        ...(visualIdentity?.logoUrl ? { logoUrl: visualIdentity.logoUrl } : {}),
        ...(visualIdentity?.watermarkUrl ? { watermarkUrl: visualIdentity.watermarkUrl } : {}),
      }

      const outputPath = join(tmpdir(), `render-${renderJobId}.png`)
      const serveUrl = await getBundleUrl()

      const composition = await selectComposition({
        serveUrl,
        id: templateCfg.id,
        inputProps: props,
      })

      await withTimeout(
        renderStill({
          composition,
          serveUrl,
          output: outputPath,
          inputProps: props,
        }),
        RENDER_TIMEOUT_MS,
        `renderStill for job ${renderJobId}`,
      )

      const key = `renders/${workspaceId}/${scriptId}/${renderJobId}.png`
      const outputUrl = await uploadFile(outputPath, key)

      await unlink(outputPath).catch(() => {})

      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { status: 'DONE', outputUrl },
      })

      return { outputUrl }
    },
    {
      connection,
      concurrency: 2,
    },
  )
}
