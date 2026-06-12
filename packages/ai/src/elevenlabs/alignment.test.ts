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
