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
