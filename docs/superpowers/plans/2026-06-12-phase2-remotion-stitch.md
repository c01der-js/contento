# Phase 2: Remotion Stitch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить ffmpeg-concat склейку на Remotion-композицию 1080×1920: нормализация клипов, бёрн-ин субтитры с пословными таймингами ElevenLabs, обрезка замороженных хвостов Speak-клипов, CTA-экран с брендингом. ffmpeg остаётся fallback'ом за флагом `VIDEO_STITCHER=ffmpeg`.

**Architecture:** Тайминги слов добываются на этапе генерации (`handleGenerate`) через ElevenLabs `/with-timestamps` и сохраняются в СУЩЕСТВУЮЩУЮ Json-колонку `Script.subtitles` (миграция БД не нужна). На этапе склейки (`handleStitch`) воркер собирает чистый props-объект (presigned-URL'ы клипов, длительности из ffprobe, чанки субтитров, цвета из `VisualIdentity`, CTA из `Script.cta`) и рендерит композицию `VideoStitch` из `@contento/brand-kit` через `@remotion/bundler` + `@remotion/renderer` (паттерн уже обкатан в render-worker). Вся логика — в чистых тестируемых функциях; композиция — тупой рендерер props.

**Tech Stack:** Remotion 4.0.468 (pin везде — Remotion требует совпадения версий core/bundler/renderer), React 19, `@remotion/fonts` + Inter Variable TTF в репо (кириллица, OFL-лицензия), `@aws-sdk/s3-request-presigner`, ffprobe (идёт с ffmpeg).

**Проверенные факты:**
- `packages/brand-kit/src/remotion-root.tsx` экспортирует `RemotionRoot`, но **`registerRoot()` не вызывается нигде** — bundle-entry render-worker'а нефункционален; нужен entry-файл с `registerRoot()` (заодно чинит render-worker).
- ElevenLabs `POST /v1/text-to-speech/{voiceId}/with-timestamps?output_format=mp3_44100_128` → `{ audio_base64, alignment: { characters[], character_start_times_seconds[], character_end_times_seconds[] } }`.
- `Script.subtitles Json?` существует и пустует. `VisualIdentity` (unique по workspaceId): primaryColor/secondaryColor/accentColor/logoUrl и др.
- S3-клиент video-worker читает `S3_ACCESS_KEY`/`S3_SECRET_KEY`, бакет приватный → клипам нужны presigned GET URL. Mock-клип (`MOCK_CLIP_URL`) — внешний https URL, его presign'ить нельзя — передавать как есть.
- Выходной ключ S3 и формат `outputUrl` сохраняем (`videos/{workspaceId}/{scriptId}/{videoJobId}.mp4`) — API/web не трогаем.

---

## File Structure

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `packages/ai/src/elevenlabs/alignment.ts` | создать | `alignmentToWords()` — посимвольный alignment → слова (чистая) |
| `packages/ai/src/elevenlabs/alignment.test.ts` | создать | тесты конвертера |
| `packages/ai/src/elevenlabs/client.ts` | изменить | `synthesizeSpeechWithTimestamps()` |
| `packages/ai/src/elevenlabs/index.ts` | изменить | экспорты |
| `packages/brand-kit/src/remotion-entry.ts` | создать | `registerRoot(RemotionRoot)` — единственный bundle-entry |
| `packages/brand-kit/public/fonts/Inter-Variable.ttf` (+OFL.txt) | создать | шрифт субтитров (кириллица) |
| `packages/brand-kit/src/compositions/video-stitch-shared.ts` | создать | типы props + `calcStitchDurationInFrames` (без remotion-импортов — тестируемо) |
| `packages/brand-kit/src/compositions/video-stitch-shared.test.ts` | создать | тест калькулятора длительности |
| `packages/brand-kit/src/compositions/VideoStitch.tsx` | создать | композиция: шоты, субтитры, CTA-экран |
| `packages/brand-kit/src/remotion-root.tsx` | изменить | регистрация VideoStitch c calculateMetadata |
| `packages/brand-kit/src/index.ts` | изменить | экспорты |
| `packages/brand-kit/package.json`, `apps/render-worker/package.json` | изменить | пин remotion 4.0.468; @remotion/fonts |
| `apps/render-worker/src/worker.ts` | изменить | REMOTION_ENTRY → remotion-entry.ts (фикс registerRoot) |
| `apps/video-worker/package.json` | изменить | + @remotion/bundler, @remotion/renderer, @aws-sdk/s3-request-presigner |
| `apps/video-worker/src/s3-client.ts` | изменить | `presignGetUrl()` |
| `apps/video-worker/src/stitch.ts` | изменить | `buildFfprobeArgs()`, `probeDurationSec()` |
| `apps/video-worker/src/stitch-props.ts` | создать | `parseSubtitlesJson`, `chunkWords`, `buildShotProps`, `buildStitchProps` (чистые) |
| `apps/video-worker/src/stitch-props.test.ts` | создать | TDD-тесты props-сборки |
| `apps/video-worker/src/remotion-stitch.ts` | создать | bundle-синглтон + `renderStitchVideo()` |
| `apps/video-worker/src/worker.ts` | изменить | generate: тайминги → Script.subtitles; stitch: ветка remotion/ffmpeg |
| `apps/video-worker/src/video-worker.test.ts` | изменить | моки + тесты |
| `apps/video-worker/scripts/render-smoke.ts` | создать | ручной smoke-рендер композиции |
| `infra/.env.example` | изменить | `VIDEO_STITCHER` |

---

### Task 1: ElevenLabs with-timestamps + конвертер alignment→слова

**Files:**
- Create: `packages/ai/src/elevenlabs/alignment.ts`, `packages/ai/src/elevenlabs/alignment.test.ts`
- Modify: `packages/ai/src/elevenlabs/client.ts`, `packages/ai/src/elevenlabs/index.ts`

- [ ] **Step 1: Падающий тест.** Создать `packages/ai/src/elevenlabs/alignment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alignmentToWords } from './alignment.js'

function align(chars: string, starts: number[], ends: number[]) {
  return {
    characters: chars.split(''),
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  }
}

describe('alignmentToWords', () => {
  it('groups characters into words split by spaces', () => {
    // "Привет мир" — 6 chars, space, 3 chars
    const starts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    const ends = starts.map(s => s + 0.1)
    const words = alignmentToWords(align('Привет мир', starts, ends))
    expect(words).toEqual([
      { text: 'Привет', startSec: 0, endSec: 0.6 },
      { text: 'мир', startSec: 0.7, endSec: 1.0 },
    ])
  })

  it('keeps punctuation attached to its word and collapses repeated whitespace', () => {
    const text = 'Да!  Нет.'
    const starts = text.split('').map((_, i) => i * 0.1)
    const ends = starts.map(s => s + 0.1)
    const words = alignmentToWords(align(text, starts, ends))
    expect(words.map(w => w.text)).toEqual(['Да!', 'Нет.'])
    expect(words[1]!.startSec).toBeCloseTo(0.5)
  })

  it('handles newlines as separators and empty input', () => {
    expect(alignmentToWords(align('', [], []))).toEqual([])
    const words = alignmentToWords(align('а\nб', [0, 0.1, 0.2], [0.1, 0.2, 0.3]))
    expect(words.map(w => w.text)).toEqual(['а', 'б'])
  })
})
```

- [ ] **Step 2: Убедиться, что падает.** `pnpm --filter @contento/ai exec vitest run src/elevenlabs/alignment.test.ts` → FAIL (нет модуля).

- [ ] **Step 3: Реализовать.** Создать `packages/ai/src/elevenlabs/alignment.ts`:

```ts
/** Word-level timing relative to the start of the audio, in seconds. */
export interface WordTiming {
  text: string
  startSec: number
  endSec: number
}

/** Character alignment as returned by ElevenLabs /with-timestamps. */
export interface CharacterAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

/**
 * Collapse ElevenLabs' per-character alignment into word timings.
 * Words are split on any whitespace; punctuation stays attached to its word.
 */
export function alignmentToWords(a: CharacterAlignment): WordTiming[] {
  const words: WordTiming[] = []
  let text = ''
  let startSec = 0
  let endSec = 0
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i] ?? ''
    if (/\s/.test(ch)) {
      if (text) {
        words.push({ text, startSec, endSec })
        text = ''
      }
      continue
    }
    if (!text) startSec = a.character_start_times_seconds[i] ?? 0
    endSec = a.character_end_times_seconds[i] ?? endSec
    text += ch
  }
  if (text) words.push({ text, startSec, endSec })
  return words
}
```

- [ ] **Step 4: Тесты зелёные.** Та же команда → PASS (3 теста).

- [ ] **Step 5: Клиент.** В `packages/ai/src/elevenlabs/client.ts` добавить после `synthesizeSpeech` (импорт alignment вверху файла: `import { alignmentToWords } from './alignment.js'` и `import type { WordTiming, CharacterAlignment } from './alignment.js'`):

```ts
export interface SpeechWithTimestamps {
  audio: Buffer
  words: WordTiming[]
}

/**
 * TTS with per-character timestamps (ElevenLabs /with-timestamps), collapsed to
 * word timings for subtitle burn-in. Same voice/model/format as synthesizeSpeech.
 */
export async function synthesizeSpeechWithTimestamps(
  text: string,
  voiceId: string,
): Promise<SpeechWithTimestamps> {
  const voiceToUse = voiceId || process.env['ELEVENLABS_VOICE_ID'] || ''
  if (!voiceToUse) throw new Error('ELEVENLABS_VOICE_ID is not set')

  return withRetry(async () => {
    const response = await fetch(
      `${BASE_URL}/text-to-speech/${voiceToUse}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey(),
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      throw new HttpStatusError(response.status, `ElevenLabs TTS error ${response.status}: ${err}`)
    }

    const data = (await response.json()) as {
      audio_base64?: string
      alignment?: CharacterAlignment | null
    }
    if (!data.audio_base64) throw new Error('ElevenLabs with-timestamps response missing audio_base64')

    return {
      audio: Buffer.from(data.audio_base64, 'base64'),
      words: data.alignment ? alignmentToWords(data.alignment) : [],
    }
  })
}
```

- [ ] **Step 6: Экспорты.** В `packages/ai/src/elevenlabs/index.ts`:

```ts
export { synthesizeSpeech, synthesizeSpeechWithTimestamps } from './client.js'
export type { SpeechWithTimestamps } from './client.js'
export { alignmentToWords } from './alignment.js'
export type { WordTiming, CharacterAlignment } from './alignment.js'
```

- [ ] **Step 7: Verify + commit.** `pnpm --filter @contento/ai exec vitest run` (все зелёные), `pnpm --filter @contento/ai run typecheck`.

```bash
git add packages/ai/src/elevenlabs/
git commit -m "feat(ai): ElevenLabs TTS with word timestamps for subtitle burn-in

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: brand-kit — entry с registerRoot, шрифт, композиция VideoStitch

**Files:**
- Create: `packages/brand-kit/src/remotion-entry.ts`, `packages/brand-kit/public/fonts/Inter-Variable.ttf`, `packages/brand-kit/public/fonts/OFL.txt`, `packages/brand-kit/src/compositions/video-stitch-shared.ts`, `packages/brand-kit/src/compositions/video-stitch-shared.test.ts`, `packages/brand-kit/src/compositions/VideoStitch.tsx`
- Modify: `packages/brand-kit/src/remotion-root.tsx`, `packages/brand-kit/src/index.ts`, `packages/brand-kit/package.json`, `apps/render-worker/package.json`, `apps/render-worker/src/worker.ts`

- [ ] **Step 1: Пин версий Remotion.** В `packages/brand-kit/package.json` dependencies: `"remotion": "4.0.468"`, `"@remotion/player": "4.0.468"`, добавить `"@remotion/fonts": "4.0.468"`. В `apps/render-worker/package.json`: `"@remotion/bundler": "4.0.468"`, `"@remotion/renderer": "4.0.468"`. Затем `pnpm install` из корня (обновит lockfile). Remotion требует одинаковую точную версию core/bundler/renderer — сейчас в lockfile разнобой 4.0.457/4.0.468.

- [ ] **Step 2: Шрифт.** Скачать Inter Variable (OFL-лицензия, поддержка кириллицы):

```bash
mkdir -p packages/brand-kit/public/fonts
curl -fsSL -o packages/brand-kit/public/fonts/Inter-Variable.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
curl -fsSL -o packages/brand-kit/public/fonts/OFL.txt "https://github.com/google/fonts/raw/main/ofl/inter/OFL.txt"
ls -la packages/brand-kit/public/fonts/  # TTF должен быть ~800KB+
```

- [ ] **Step 3: Падающий тест shared-модуля.** Создать `packages/brand-kit/src/compositions/video-stitch-shared.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcStitchDurationInFrames, DEFAULT_VIDEO_STITCH_PROPS } from './video-stitch-shared.js'

describe('calcStitchDurationInFrames', () => {
  it('sums shot durations plus CTA card', () => {
    const frames = calcStitchDurationInFrames({
      ...DEFAULT_VIDEO_STITCH_PROPS,
      shots: [
        { src: 'a', durationInFrames: 90, chunks: [] },
        { src: 'b', durationInFrames: 150, chunks: [] },
      ],
      ctaDurationInFrames: 75,
    })
    expect(frames).toBe(315)
  })

  it('never returns less than 1 frame', () => {
    expect(
      calcStitchDurationInFrames({ ...DEFAULT_VIDEO_STITCH_PROPS, shots: [], ctaDurationInFrames: 0 }),
    ).toBe(1)
  })
})
```

Прогнать `pnpm --filter @contento/brand-kit exec vitest run` → FAIL (нет модуля).

- [ ] **Step 4: shared-модуль.** Создать `packages/brand-kit/src/compositions/video-stitch-shared.ts` (БЕЗ remotion-импортов — чтобы тесты и video-worker могли импортировать без side effects):

```ts
/** One word of a burned-in subtitle, frames relative to the START OF ITS SHOT. */
export interface StitchWord {
  text: string
  startFrame: number
  endFrame: number
}

/** A subtitle phrase shown as one block; frames relative to the shot start. */
export interface StitchChunk {
  startFrame: number
  endFrame: number
  words: StitchWord[]
}

export interface StitchShotProps {
  /** URL fetchable by the renderer (presigned S3 or public). */
  src: string
  /** Trimmed shot length in frames (may be shorter than the source clip). */
  durationInFrames: number
  chunks: StitchChunk[]
}

export interface VideoStitchProps {
  shots: StitchShotProps[]
  cta: string
  ctaDurationInFrames: number
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl?: string
}

export const VIDEO_STITCH_FPS = 30
export const VIDEO_STITCH_ID = 'VideoStitch'

export const DEFAULT_VIDEO_STITCH_PROPS: VideoStitchProps = {
  shots: [],
  cta: 'Подпишись',
  ctaDurationInFrames: 75,
  primaryColor: '#1a1a2e',
  secondaryColor: '#0d0d1a',
  accentColor: '#e94560',
}

export function calcStitchDurationInFrames(props: VideoStitchProps): number {
  const shotFrames = props.shots.reduce((sum, s) => sum + s.durationInFrames, 0)
  return Math.max(1, shotFrames + props.ctaDurationInFrames)
}
```

Тест из Step 3 → PASS.

- [ ] **Step 5: Композиция.** Создать `packages/brand-kit/src/compositions/VideoStitch.tsx`:

```tsx
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion'
import { loadFont } from '@remotion/fonts'
import type { StitchChunk, StitchShotProps, VideoStitchProps } from './video-stitch-shared.js'

const SUBTITLE_FONT = 'ContentoInter'

// loadFont uses the browser FontFace API. This module is also imported in plain
// Node (worker imports @contento/brand-kit for types/consts; vitest), where
// FontFace doesn't exist — so the call must be guarded, not just .catch()'ed.
if (typeof window !== 'undefined') {
  loadFont({
    family: SUBTITLE_FONT,
    url: staticFile('fonts/Inter-Variable.ttf'),
    weight: '100 900',
  }).catch(() => {
    // Font loading must never crash the render; Chromium falls back to sans-serif.
  })
}

function SubtitleChunkView({ chunk, accentColor }: { chunk: StitchChunk; accentColor: string }) {
  const frame = useCurrentFrame() // relative to the chunk's Sequence
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20%',
        left: 60,
        right: 60,
        textAlign: 'center',
        fontFamily: SUBTITLE_FONT,
        fontWeight: 800,
        fontSize: 60,
        lineHeight: 1.3,
        color: '#fff',
        textShadow: '0 4px 24px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)',
      }}
    >
      {chunk.words.map((w, i) => {
        const localStart = w.startFrame - chunk.startFrame
        const localEnd = w.endFrame - chunk.startFrame
        const active = frame >= localStart && frame < localEnd
        return (
          <span key={i} style={{ color: active ? accentColor : '#fff', marginRight: 16 }}>
            {w.text}
          </span>
        )
      })}
    </div>
  )
}

function ShotLayer({ shot, accentColor }: { shot: StitchShotProps; accentColor: string }) {
  const frame = useCurrentFrame()
  // Subtle Ken Burns zoom so static avatar shots don't feel frozen.
  const scale = interpolate(frame, [0, Math.max(1, shot.durationInFrames)], [1, 1.04])
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <OffthreadVideo
        src={shot.src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
        }}
      />
      {shot.chunks.map((c, i) => (
        <Sequence key={i} from={c.startFrame} durationInFrames={Math.max(1, c.endFrame - c.startFrame)}>
          <SubtitleChunkView chunk={c} accentColor={accentColor} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

function CtaCard({
  cta,
  primaryColor,
  secondaryColor,
  accentColor,
  logoUrl,
}: {
  cta: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl?: string
}) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  const y = interpolate(frame, [0, 12], [24, 0], { extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: SUBTITLE_FONT,
        opacity,
      }}
    >
      {logoUrl && <img src={logoUrl} alt="" style={{ height: 110, marginBottom: 56, objectFit: 'contain' }} />}
      <div
        style={{
          color: '#fff',
          fontSize: 76,
          fontWeight: 800,
          textAlign: 'center',
          padding: '0 90px',
          lineHeight: 1.2,
          transform: `translateY(${y}px)`,
        }}
      >
        {cta}
      </div>
      <div style={{ width: 140, height: 8, background: accentColor, borderRadius: 4, marginTop: 56 }} />
    </AbsoluteFill>
  )
}

export function VideoStitch(props: VideoStitchProps) {
  let offset = 0
  const offsets = props.shots.map(s => {
    const o = offset
    offset += s.durationInFrames
    return o
  })
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {props.shots.map((shot, i) => (
        <Sequence key={i} from={offsets[i]!} durationInFrames={shot.durationInFrames}>
          <ShotLayer shot={shot} accentColor={props.accentColor} />
        </Sequence>
      ))}
      <Sequence from={offset} durationInFrames={props.ctaDurationInFrames}>
        <CtaCard
          cta={props.cta}
          primaryColor={props.primaryColor}
          secondaryColor={props.secondaryColor}
          accentColor={props.accentColor}
          {...(props.logoUrl ? { logoUrl: props.logoUrl } : {})}
        />
      </Sequence>
    </AbsoluteFill>
  )
}
```

- [ ] **Step 6: Регистрация.** В `packages/brand-kit/src/remotion-root.tsx` добавить импорты:

```tsx
import { VideoStitch } from './compositions/VideoStitch.js'
import {
  DEFAULT_VIDEO_STITCH_PROPS,
  VIDEO_STITCH_FPS,
  VIDEO_STITCH_ID,
  calcStitchDurationInFrames,
  type VideoStitchProps,
} from './compositions/video-stitch-shared.js'
```

и внутри `RemotionRoot` после `{TEMPLATE_CONFIG.map(...)}` добавить:

```tsx
      <Composition
        id={VIDEO_STITCH_ID}
        component={VideoStitch as unknown as AnyFC}
        durationInFrames={300}
        fps={VIDEO_STITCH_FPS}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_VIDEO_STITCH_PROPS as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => ({
          durationInFrames: calcStitchDurationInFrames(props as unknown as VideoStitchProps),
        })}
      />
```

- [ ] **Step 7: Entry с registerRoot.** Создать `packages/brand-kit/src/remotion-entry.ts`:

```ts
import { registerRoot } from 'remotion'
import { RemotionRoot } from './remotion-root.js'

// The one and only Remotion bundle entry. bundle() entryPoints MUST call
// registerRoot() — pointing at remotion-root.tsx directly fails at
// selectComposition with "registerRoot() was not called".
registerRoot(RemotionRoot)
```

И в `apps/render-worker/src/worker.ts` заменить путь entry:

```ts
const REMOTION_ENTRY = fileURLToPath(
  new URL('../../../packages/brand-kit/src/remotion-entry.ts', import.meta.url),
)
```

- [ ] **Step 8: Экспорты пакета.** В `packages/brand-kit/src/index.ts` добавить:

```ts
export { VideoStitch } from './compositions/VideoStitch.js'
export {
  DEFAULT_VIDEO_STITCH_PROPS,
  VIDEO_STITCH_FPS,
  VIDEO_STITCH_ID,
  calcStitchDurationInFrames,
} from './compositions/video-stitch-shared.js'
export type {
  StitchWord,
  StitchChunk,
  StitchShotProps,
  VideoStitchProps,
} from './compositions/video-stitch-shared.js'
```

- [ ] **Step 9: Verify + commit.**

```
pnpm --filter @contento/brand-kit exec vitest run        # 2 теста PASS
pnpm --filter @contento/brand-kit run typecheck          # PASS
pnpm --filter @contento/brand-kit run build              # PASS (нужен для потребителей dist)
pnpm --filter @contento/render-worker run typecheck      # PASS (проверь имя пакета в package.json)
```

```bash
git add packages/brand-kit/ apps/render-worker/package.json apps/render-worker/src/worker.ts pnpm-lock.yaml
git commit -m "feat(brand-kit): VideoStitch composition with karaoke subtitles and CTA card, registerRoot entry, pinned remotion 4.0.468

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: video-worker generate-путь — сбор таймингов в Script.subtitles

**Files:**
- Modify: `apps/video-worker/src/worker.ts`, `apps/video-worker/src/video-worker.test.ts`

- [ ] **Step 1:** В `apps/video-worker/src/worker.ts` заменить в импорте из `@contento/ai` `synthesizeSpeech` на `synthesizeSpeechWithTimestamps` и добавить `import type { WordTiming } from '@contento/ai'`.

- [ ] **Step 2:** В `handleGenerate` перед циклом шотов добавить аккумулятор:

```ts
  // Word timings per shot, persisted to Script.subtitles for the Remotion
  // stitch to burn in subtitles. Shape: { version: 1, shots: ShotTimingJson[] }
  const shotTimings: Array<{ index: number; audioSec: number; words: WordTiming[] }> = []
```

В ветке `if (shot.dialogue)` заменить строку `const mp3Buffer = await synthesizeSpeech(shot.dialogue, voiceId)` на:

```ts
          const tts = await synthesizeSpeechWithTimestamps(shot.dialogue, voiceId)
          const mp3Buffer = tts.audio
```

После строки `audioUrl = await uploadToHiggsfield(...)` добавить:

```ts
          shotTimings.push({ index: shot.index, audioSec, words: tts.words })
```

- [ ] **Step 3:** После цикла шотов, СРАЗУ после блока `if (cancelled) {...return}` добавить:

```ts
  if (shotTimings.length > 0) {
    await prisma.script.update({
      where: { id: scriptId },
      data: { subtitles: { version: 1, shots: shotTimings } },
    }).catch(err => {
      // Subtitles are an enhancement — never fail the whole job over them.
      console.error(`[video-worker] failed to persist subtitles for script ${scriptId}:`, err)
    })
  }
```

- [ ] **Step 4: Тесты.** В `apps/video-worker/src/video-worker.test.ts` в mock-фабрике `@contento/ai` заменить `synthesizeSpeech: vi.fn()` на:

```ts
  synthesizeSpeech: vi.fn(),
  synthesizeSpeechWithTimestamps: vi.fn(async () => ({ audio: Buffer.alloc(8), words: [] })),
```

Прогнать `pnpm --filter @contento/video-worker exec vitest run` → все прежние тесты PASS.

- [ ] **Step 5: Verify + commit.** `pnpm --filter @contento/ai run build && pnpm --filter @contento/video-worker run typecheck` → PASS.

```bash
git add apps/video-worker/src/worker.ts apps/video-worker/src/video-worker.test.ts
git commit -m "feat(video-worker): collect word timings during TTS and persist to Script.subtitles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: video-worker stitch-путь — props-сборка и Remotion-рендер за флагом

**Files:**
- Modify: `apps/video-worker/package.json`, `apps/video-worker/src/s3-client.ts`, `apps/video-worker/src/stitch.ts`, `apps/video-worker/src/worker.ts`, `apps/video-worker/src/video-worker.test.ts`
- Create: `apps/video-worker/src/stitch-props.ts`, `apps/video-worker/src/stitch-props.test.ts`, `apps/video-worker/src/remotion-stitch.ts`

- [ ] **Step 1: Зависимости.** В `apps/video-worker/package.json` dependencies добавить:

```json
    "@contento/brand-kit": "workspace:*",
    "@remotion/bundler": "4.0.468",
    "@remotion/renderer": "4.0.468",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
```

`pnpm install` из корня.

- [ ] **Step 2: Падающие тесты props-сборки.** Создать `apps/video-worker/src/stitch-props.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  chunkWords,
  buildShotProps,
  buildStitchProps,
  parseSubtitlesJson,
  STITCH_FPS,
} from './stitch-props.js'

const w = (text: string, startFrame: number, endFrame: number) => ({ text, startFrame, endFrame })

describe('chunkWords', () => {
  it('groups words into chunks of at most maxWords', () => {
    const words = [w('а', 0, 5), w('б', 5, 10), w('в', 10, 15), w('г', 15, 20), w('д', 20, 25)]
    const chunks = chunkWords(words, 4, 24)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.words.map(x => x.text)).toEqual(['а', 'б', 'в', 'г'])
    expect(chunks[1]!.words.map(x => x.text)).toEqual(['д'])
  })

  it('starts a new chunk on a long pause', () => {
    const words = [w('до', 0, 10), w('после', 60, 70)] // gap 50 frames > 24
    const chunks = chunkWords(words, 4, 24)
    expect(chunks).toHaveLength(2)
  })

  it('extends each chunk until the next one starts (hold on screen)', () => {
    const words = [w('a', 0, 10), w('b', 10, 20), w('c', 20, 30), w('d', 30, 40), w('e', 50, 60)]
    const chunks = chunkWords(words, 4, 24)
    expect(chunks[0]!.endFrame).toBe(50) // held until chunk 2 starts
    expect(chunks[1]!.endFrame).toBe(66) // last chunk: +6 frames hold
  })

  it('returns empty array for no words', () => {
    expect(chunkWords([], 4, 24)).toEqual([])
  })
})

describe('buildShotProps', () => {
  it('trims the clip to last word end + 0.4s (frozen Speak tail removal)', () => {
    // 10s clip, speech ends at 7.0s -> trim to 7.4s
    const timing = { index: 0, audioSec: 7, words: [{ text: 'конец', startSec: 6.5, endSec: 7.0 }] }
    const shot = buildShotProps('http://clip', 10, timing)
    expect(shot.durationInFrames).toBe(Math.round(7.4 * STITCH_FPS))
  })

  it('keeps full probed duration for silent shots', () => {
    const shot = buildShotProps('http://clip', 3.5, undefined)
    expect(shot.durationInFrames).toBe(Math.round(3.5 * STITCH_FPS))
    expect(shot.chunks).toEqual([])
  })

  it('never trims beyond the probed duration and clamps word frames into the shot', () => {
    const timing = {
      index: 0,
      audioSec: 9,
      words: [{ text: 'хвост', startSec: 8.8, endSec: 9.5 }], // ends past the 9s clip
    }
    const shot = buildShotProps('http://clip', 9, timing)
    expect(shot.durationInFrames).toBe(9 * STITCH_FPS)
    const lastWord = shot.chunks.at(-1)!.words.at(-1)!
    expect(lastWord.endFrame).toBeLessThanOrEqual(shot.durationInFrames)
  })
})

describe('parseSubtitlesJson', () => {
  it('accepts the v1 shape and rejects garbage', () => {
    const good = { version: 1, shots: [{ index: 0, audioSec: 2, words: [{ text: 'а', startSec: 0, endSec: 1 }] }] }
    expect(parseSubtitlesJson(good)?.shots).toHaveLength(1)
    expect(parseSubtitlesJson(null)).toBeUndefined()
    expect(parseSubtitlesJson({ version: 2 })).toBeUndefined()
    expect(parseSubtitlesJson({ version: 1, shots: 'nope' })).toBeUndefined()
  })
})

describe('buildStitchProps', () => {
  it('assembles props with brand colors and falls back to defaults', () => {
    const props = buildStitchProps({
      shots: [{ src: 'http://a', probedSec: 5 }],
      cta: 'Подпишись!',
      visual: { primaryColor: '#111111', secondaryColor: null, accentColor: '#ff0000', logoUrl: null },
    })
    expect(props.cta).toBe('Подпишись!')
    expect(props.primaryColor).toBe('#111111')
    expect(props.secondaryColor).toBe('#0d0d1a') // default
    expect(props.accentColor).toBe('#ff0000')
    expect(props.logoUrl).toBeUndefined()
    expect(props.shots).toHaveLength(1)
    expect(props.ctaDurationInFrames).toBe(75)
  })
})
```

Прогнать → FAIL (нет модуля).

- [ ] **Step 3: Реализовать stitch-props.ts.** Создать `apps/video-worker/src/stitch-props.ts`:

```ts
import type { StitchChunk, StitchShotProps, StitchWord, VideoStitchProps } from '@contento/brand-kit'
import { DEFAULT_VIDEO_STITCH_PROPS, VIDEO_STITCH_FPS } from '@contento/brand-kit'

export const STITCH_FPS = VIDEO_STITCH_FPS

/** Per-shot timings as persisted in Script.subtitles (version 1). */
export interface ShotTimingJson {
  index: number
  audioSec: number
  words: Array<{ text: string; startSec: number; endSec: number }>
}

export interface SubtitlesJson {
  version: 1
  shots: ShotTimingJson[]
}

/** Defensive parse of the Script.subtitles Json column. Undefined on any mismatch. */
export function parseSubtitlesJson(value: unknown): SubtitlesJson | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as { version?: unknown; shots?: unknown }
  if (v.version !== 1 || !Array.isArray(v.shots)) return undefined
  for (const s of v.shots as unknown[]) {
    const shot = s as { index?: unknown; audioSec?: unknown; words?: unknown }
    if (typeof shot.index !== 'number' || !Array.isArray(shot.words)) return undefined
  }
  return value as SubtitlesJson
}

/**
 * Group word timings into subtitle chunks (phrases). A chunk breaks on
 * maxWords or on a pause longer than maxGapFrames. Each chunk stays on screen
 * until the next one starts (or +6 frames for the last one).
 */
export function chunkWords(words: StitchWord[], maxWords = 4, maxGapFrames = 24): StitchChunk[] {
  const chunks: StitchChunk[] = []
  let current: StitchWord[] = []
  const flush = () => {
    if (current.length === 0) return
    chunks.push({
      startFrame: current[0]!.startFrame,
      endFrame: current[current.length - 1]!.endFrame,
      words: current,
    })
    current = []
  }
  for (const word of words) {
    const prev = current[current.length - 1]
    if (current.length >= maxWords || (prev && word.startFrame - prev.endFrame > maxGapFrames)) flush()
    current.push(word)
  }
  flush()
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1]
    chunks[i]!.endFrame = next ? next.startFrame : chunks[i]!.endFrame + 6
  }
  return chunks
}

/** Extra tail kept after the last spoken word, so the cut isn't mid-gesture. */
const TRIM_PADDING_SEC = 0.4

/**
 * Build one shot's props: trim the frozen tail of Speak clips (clip length is
 * bucketed 5/10/15s while speech may end earlier) and convert word timings to
 * frames relative to the shot start, clamped into the trimmed duration.
 */
export function buildShotProps(src: string, probedSec: number, timing?: ShotTimingJson): StitchShotProps {
  const lastWordEnd = timing && timing.words.length > 0 ? timing.words[timing.words.length - 1]!.endSec : 0
  const trimmedSec = lastWordEnd > 0 ? Math.min(probedSec, lastWordEnd + TRIM_PADDING_SEC) : probedSec
  const durationInFrames = Math.max(1, Math.round(trimmedSec * STITCH_FPS))
  const words: StitchWord[] = (timing?.words ?? []).map(w => ({
    text: w.text,
    startFrame: Math.min(Math.round(w.startSec * STITCH_FPS), durationInFrames - 1),
    endFrame: Math.min(Math.round(w.endSec * STITCH_FPS), durationInFrames),
  }))
  const chunks = chunkWords(words)
  for (const chunk of chunks) chunk.endFrame = Math.min(chunk.endFrame, durationInFrames)
  return { src, durationInFrames, chunks }
}

export interface StitchShotInput {
  src: string
  probedSec: number
  timing?: ShotTimingJson
}

export interface VisualIdentityColors {
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  logoUrl: string | null
}

export function buildStitchProps(input: {
  shots: StitchShotInput[]
  cta: string
  visual?: VisualIdentityColors | null
}): VideoStitchProps {
  const d = DEFAULT_VIDEO_STITCH_PROPS
  return {
    shots: input.shots.map(s => buildShotProps(s.src, s.probedSec, s.timing)),
    cta: input.cta,
    ctaDurationInFrames: d.ctaDurationInFrames,
    primaryColor: input.visual?.primaryColor ?? d.primaryColor,
    secondaryColor: input.visual?.secondaryColor ?? d.secondaryColor,
    accentColor: input.visual?.accentColor ?? d.accentColor,
    ...(input.visual?.logoUrl ? { logoUrl: input.visual.logoUrl } : {}),
  }
}
```

Тесты Step 2 → PASS.

- [ ] **Step 4: presign + ffprobe.** В `apps/video-worker/src/s3-client.ts` добавить (импорт `getSignedUrl` из `@aws-sdk/s3-request-presigner` вверху):

```ts
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
```

```ts
/**
 * Presigned GET URL for a private object — lets the Remotion renderer's
 * Chromium fetch shot clips directly without bucket credentials.
 */
export async function presignGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec })
}

/** True when the URL points at our S3/MinIO endpoint (as produced by uploadBuffer). */
export function isOwnS3Url(url: string): boolean {
  const endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000'
  return url.startsWith(`${endpoint}/`)
}
```

В `apps/video-worker/src/stitch.ts` добавить:

```ts
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
```

- [ ] **Step 5: remotion-stitch.ts.** Создать `apps/video-worker/src/remotion-stitch.ts`:

```ts
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
```

- [ ] **Step 6: handleStitch — ветка remotion/ffmpeg.** В `apps/video-worker/src/worker.ts`:

6a. Импорты: добавить

```ts
import { stitchClips, transcodeMp3ToWav, probeDurationSec } from './stitch.js'
import { uploadVideo, uploadBuffer, downloadBuffer, keyFromUrl, presignGetUrl, isOwnS3Url } from './s3-client.js'
import { renderStitchVideo } from './remotion-stitch.js'
import { buildStitchProps, parseSubtitlesJson, type StitchShotInput } from './stitch-props.js'
```

6b. В `handleStitch` внутри существующего `try`, заменить блок от `const videoJob = await prisma.videoJob.findUnique(...)` до `await stitchClips({ clipPaths, outputPath })` включительно на:

```ts
    const videoJob = await prisma.videoJob.findUnique({
      where: { id: videoJobId },
      include: { script: true },
    })
    if (!videoJob) throw new Error(`VideoJob ${videoJobId} not found`)

    const outputPath = join(tmpdir(), `video-${videoJobId}.mp4`)
    const stitcher = process.env['VIDEO_STITCHER'] ?? 'remotion'

    if (stitcher === 'remotion') {
      // Remotion path: clips stay in S3 and are fetched by the renderer via
      // presigned URLs; durations come from ffprobe; subtitles from the
      // timings persisted by handleGenerate.
      const subtitles = parseSubtitlesJson(videoJob.script.subtitles)
      const visual = await prisma.visualIdentity.findUnique({
        where: { workspaceId: videoJob.workspaceId },
      })
      const shotInputs: StitchShotInput[] = []
      for (const shot of shots) {
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        // Mock clips are public external URLs — pass through unsigned.
        const src = isOwnS3Url(shot.clipUrl) ? await presignGetUrl(keyFromUrl(shot.clipUrl)) : shot.clipUrl
        const probedSec = await probeDurationSec(src)
        const timing = subtitles?.shots.find(s => s.index === shot.index)
        shotInputs.push({ src, probedSec, ...(timing ? { timing } : {}) })
      }
      const logoUrl = visual?.logoUrl
        ? (isOwnS3Url(visual.logoUrl) ? await presignGetUrl(keyFromUrl(visual.logoUrl)) : visual.logoUrl)
        : null
      const props = buildStitchProps({
        shots: shotInputs,
        cta: videoJob.script.cta,
        visual: visual ? { ...visual, logoUrl } : null,
      })
      await renderStitchVideo(props, outputPath)
    } else {
      // Legacy ffmpeg concat fallback (VIDEO_STITCHER=ffmpeg).
      for (const shot of shots) {
        if (!shot.clipUrl) throw new Error(`Shot ${shot.id} has no clipUrl`)
        // Read clips with authenticated S3 (the bucket is private — an anonymous
        // HTTP GET returns 403, which previously stalled the job at STITCHING).
        const buf = await downloadBuffer(keyFromUrl(shot.clipUrl))
        const localPath = join(tmpdir(), `shot-${shot.id}.mp4`)
        await writeFile(localPath, buf)
        clipPaths.push(localPath)
      }
      await stitchClips({ clipPaths, outputPath })
    }
```

(строки `const key = ...`, `uploadVideo`, `unlink`, обновление `DONE` и весь catch/finally — без изменений; объявление `const outputPath` ниже по коду удалить, оно переехало выше)

- [ ] **Step 7: Тесты worker.** В `apps/video-worker/src/video-worker.test.ts`:

7a. В mock-фабрику `./s3-client.js` добавить:

```ts
  presignGetUrl: vi.fn(async (key: string) => `http://presigned/${key}`),
  isOwnS3Url: vi.fn(() => true),
```

7b. Добавить mock новых модулей (рядом с mock `bullmq`):

```ts
vi.mock('./remotion-stitch.js', () => ({ renderStitchVideo: vi.fn() }))
```

7c. В mock `@contento/db` добавить `visualIdentity: { findUnique: vi.fn() }` и в `videoJob` — `findUnique: vi.fn()` (уже есть — проверить).

7d. Прогнать все тесты воркера: прежние + stitch-props PASS.

- [ ] **Step 8: Verify + commit.**

```
pnpm --filter @contento/video-worker exec vitest run     # все PASS
pnpm --filter @contento/video-worker run typecheck       # PASS
pnpm --filter @contento/api run typecheck                # PASS (не трогали, но проверить)
```

```bash
git add apps/video-worker/ pnpm-lock.yaml
git commit -m "feat(video-worker): Remotion stitch with burned-in subtitles behind VIDEO_STITCHER flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Smoke-рендер, env-доки, финальная верификация

**Files:**
- Create: `apps/video-worker/scripts/render-smoke.ts`
- Modify: `infra/.env.example`

- [ ] **Step 1: Smoke-скрипт.** Создать `apps/video-worker/scripts/render-smoke.ts`:

```ts
import { join } from 'path'
import { tmpdir } from 'os'
import { stat } from 'fs/promises'
import { renderStitchVideo } from '../src/remotion-stitch.js'
import type { VideoStitchProps } from '@contento/brand-kit'

const props: VideoStitchProps = {
  shots: [
    {
      src: 'https://www.w3schools.com/html/mov_bbb.mp4',
      durationInFrames: 90,
      chunks: [
        {
          startFrame: 5,
          endFrame: 85,
          words: [
            { text: 'Привет,', startFrame: 5, endFrame: 30 },
            { text: 'это', startFrame: 30, endFrame: 50 },
            { text: 'смоук-тест!', startFrame: 50, endFrame: 80 },
          ],
        },
      ],
    },
  ],
  cta: 'Подпишись на канал',
  ctaDurationInFrames: 60,
  primaryColor: '#1a1a2e',
  secondaryColor: '#0d0d1a',
  accentColor: '#e94560',
}

const out = join(tmpdir(), 'contento-stitch-smoke.mp4')
console.log('[smoke] rendering to', out)
await renderStitchVideo(props, out)
const { size } = await stat(out)
console.log(`[smoke] OK — ${out} (${(size / 1024).toFixed(0)} KB)`)
```

- [ ] **Step 2: Запустить smoke.** `pnpm --filter @contento/video-worker exec tsx scripts/render-smoke.ts`
Первый запуск скачает headless-Chromium Remotion (~150MB, нужна сеть) и соберёт webpack-бандл — это минуты. Expected: `[smoke] OK — /tmp/.../contento-stitch-smoke.mp4 (NNN KB)`, размер > 100 KB. Затем проверить длительность: `ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/contento-stitch-smoke.mp4` → ~5.0 (90+60 кадров @30fps). Если smoke падает — это блокер задачи, отлаживать (типичные причины: registerRoot, publicDir, версии remotion).

- [ ] **Step 3: env-доки.** В `infra/.env.example` после блока Higgsfield-переменных добавить:

```bash
# Final video assembly: remotion (subtitles, CTA card, brand colors) | ffmpeg (legacy concat fallback). Default: remotion
VIDEO_STITCHER=
```

- [ ] **Step 4: Полная верификация.** `pnpm typecheck && pnpm test` → всё зелёное, кроме известного pre-existing `@contento/api` (unhandled prisma от фоновых воркеров — задокументировано, Фаза 4).

- [ ] **Step 5: Commit.**

```bash
git add apps/video-worker/scripts/ infra/.env.example
git commit -m "feat(video-worker): smoke render script for Remotion stitch; document VIDEO_STITCHER

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Что сознательно НЕ входит

- Кросс-фейд между шотами (хард-каты + лёгкий зум — стандарт short-form; кросс-фейд аудио усложняет).
- Кастомный шрифт бренда из VisualIdentity.fontPrimary (субтитры всегда Inter; цвета — брендовые) — после MVP.
- Docker-образ для video-worker (Chromium+ffmpeg в Alpine) — отдельная задача деплоя, Фаза 4.
- Удаление ffmpeg-пути — остаётся fallback'ом до стабилизации Remotion-пути.

## Риски

- Первый рендер скачивает Chromium (~150MB) и собирает webpack-бандл — медленный холодный старт воркера; bundle кэшируется на процесс.
- `@remotion/google-fonts` сознательно НЕ используется (сетевая зависимость в рендере); шрифт лежит в репо (~870KB TTF, OFL).
- Тайминги отсутствуют (mock-режим, webhook-путь, старые job'ы) → видео рендерится без субтитров — graceful degradation, не ошибка.
- mp3 vs wav тайминги: alignment считается от итогового аудио, расхождений с WAV-транскодом нет (та же дорожка).
