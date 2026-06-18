import { getPlatformProfile } from '@contento/shared'

export type Severity = 'pass' | 'warn' | 'block' | 'skip'

export interface Finding {
  id: string
  severity: Severity
  message: string
}

export interface QaResult {
  status: 'PASS' | 'WARN' | 'BLOCK'
  findings: Finding[]
}

export interface QaInput {
  platform: string | null
  outputUrl: string | null
  jobStatus: string
  shots: Array<{ index: number; durationSec: number; dialogue: string | null; status: string }>
  subtitles: { version: 1; shots: Array<{ index: number; audioSec: number; words: Array<{ text: string; startSec: number; endSec: number }> }> } | null
}

/**
 * Auto pre-approval QA checks. Pure (no IO) so it is unit-testable and can run
 * inline at the CLIENT_REVIEW transition. lip-sync confidence + visual clipping
 * have no data source yet → emitted as 'skip' so the registry is ready for them.
 */
export function runQaChecks(input: QaInput): QaResult {
  const findings: Finding[] = []

  // output-ready (BLOCK): the stitched MP4 must exist.
  if (input.jobStatus === 'DONE' && input.outputUrl) {
    findings.push({ id: 'output-ready', severity: 'pass', message: 'Rendered video is available.' })
  } else {
    findings.push({ id: 'output-ready', severity: 'block', message: 'No rendered video output — the render did not finish.' })
  }

  // shots-rendered (BLOCK): there must be shots and every one must be DONE.
  const notDone = input.shots.filter((s) => s.status !== 'DONE')
  if (input.shots.length === 0) {
    findings.push({ id: 'shots-rendered', severity: 'block', message: 'No shots to render.' })
  } else if (notDone.length === 0) {
    findings.push({ id: 'shots-rendered', severity: 'pass', message: `All ${input.shots.length} shots rendered.` })
  } else {
    findings.push({ id: 'shots-rendered', severity: 'block', message: `${notDone.length} of ${input.shots.length} shots did not render.` })
  }

  // duration (WARN): total intended duration vs the platform band.
  const band = getPlatformProfile(input.platform ?? 'instagram').targetDurationSec
  const totalSec = input.shots.reduce((acc, s) => acc + s.durationSec, 0)
  if (totalSec >= band.min && totalSec <= band.max) {
    findings.push({ id: 'duration', severity: 'pass', message: `Duration ${Math.round(totalSec)}s is within the ${band.min}-${band.max}s band.` })
  } else {
    findings.push({ id: 'duration', severity: 'warn', message: `Duration ${Math.round(totalSec)}s is outside the target ${band.min}-${band.max}s band.` })
  }

  // subtitles (WARN): every shot with dialogue must have subtitle words.
  const subShots = input.subtitles?.shots ?? []
  const missing = input.shots
    .filter((s) => s.dialogue && s.dialogue.trim().length > 0)
    .filter((s) => {
      const entry = subShots.find((ss) => ss.index === s.index)
      return !entry || entry.words.length === 0
    })
  if (missing.length === 0) {
    findings.push({ id: 'subtitles', severity: 'pass', message: 'Subtitles present for every spoken shot.' })
  } else {
    findings.push({ id: 'subtitles', severity: 'warn', message: `${missing.length} spoken shot(s) have no subtitles.` })
  }

  // lip-sync + clipping: no data source yet (Higgsfield/Sync.so expose no confidence;
  // visual clipping needs frame analysis). Scaffolded so the UI/registry is ready.
  findings.push({ id: 'lip-sync', severity: 'skip', message: 'Lip-sync confidence not yet measured.' })
  findings.push({ id: 'clipping', severity: 'skip', message: 'Visual clipping not yet measured.' })

  const status = findings.some((f) => f.severity === 'block')
    ? 'BLOCK'
    : findings.some((f) => f.severity === 'warn')
      ? 'WARN'
      : 'PASS'

  return { status, findings }
}
