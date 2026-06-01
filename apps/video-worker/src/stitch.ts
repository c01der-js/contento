import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

export interface StitchInput {
  /** Ordered list of local clip file paths */
  clipPaths: string[]
  outputPath: string
}

/**
 * Concatenate ordered clips into a single 9:16 MP4 using ffmpeg's concat demuxer.
 * Re-encodes to H.264/AAC to normalize codecs across clips from Higgsfield.
 * ffmpeg must be installed and on PATH.
 */
export async function stitchClips({ clipPaths, outputPath }: StitchInput): Promise<void> {
  if (clipPaths.length === 0) throw new Error('stitchClips: no clips provided')

  const listPath = join(tmpdir(), `concat-${Date.now()}.txt`)
  const listContent = clipPaths.map(p => `file '${p}'`).join('\n')
  await writeFile(listPath, listContent, 'utf8')

  try {
    await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ])
  } finally {
    await unlink(listPath).catch(() => {})
  }
}

export function buildConcatArgs(clipPaths: string[], listPath: string, outputPath: string): string[] {
  return [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ]
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stderr: string[] = []
    proc.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-10).join('')}`))
      }
    })
    proc.on('error', reject)
  })
}
