import { spawn } from 'child_process'
import { writeFile, readFile, unlink } from 'fs/promises'
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

/**
 * Transcode an MP3 buffer to WAV (PCM s16le, mono, 44.1 kHz) using ffmpeg.
 * Higgsfield's Speak endpoint requires WAV/PCM audio (it rejects MP3 with
 * `invalid_audio_format`), but ElevenLabs only emits MP3 on lower subscription
 * tiers — so we transcode locally before uploading. The target format matches
 * the spec asserted by the repo's mock WAV builder (PCM16 / mono / 44.1 kHz).
 */
export async function transcodeMp3ToWav(mp3: Buffer): Promise<Buffer> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  const inputPath = join(tmpdir(), `tts-${stamp}.mp3`)
  const outputPath = join(tmpdir(), `tts-${stamp}.wav`)
  await writeFile(inputPath, mp3)
  try {
    await runFfmpeg(['-i', inputPath, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', outputPath])
    return await readFile(outputPath)
  } finally {
    await unlink(inputPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
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

export function buildFfprobeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input]
}

/** Duration in seconds of a local file or http(s) URL, via ffprobe (ships with ffmpeg). */
export function probeDurationSec(input: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', buildFfprobeArgs(input), { stdio: ['ignore', 'pipe', 'pipe'] })
    const out: string[] = []
    const err: string[] = []
    proc.stdout?.on('data', (d: Buffer) => out.push(d.toString()))
    proc.stderr?.on('data', (d: Buffer) => err.push(d.toString()))
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err.join('')}`))
      const sec = parseFloat(out.join('').trim())
      if (!Number.isFinite(sec) || sec <= 0) return reject(new Error(`ffprobe returned invalid duration: ${out.join('')}`))
      resolve(sec)
    })
    proc.on('error', reject)
  })
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
