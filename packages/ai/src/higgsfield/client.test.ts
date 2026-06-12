import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildSoulParams, buildSpeakParams, buildDopParams } from './client.js'

const ENV_KEYS = ['HIGGSFIELD_SPEAK_QUALITY', 'HIGGSFIELD_DOP_MODEL'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('buildSoulParams', () => {
  it('uses vertical 9:16 frame and 1080p', () => {
    const p = buildSoulParams('a man talking', 'soul-1')
    expect(p.width_and_height).toBe('1152x2048')
    expect(p.quality).toBe('1080p')
    expect(p.custom_reference_id).toBe('soul-1')
    expect(p.batch_size).toBe(1)
  })

  it('passes seed through when provided', () => {
    expect(buildSoulParams('x', 's', { seed: 42 }).seed).toBe(42)
    expect('seed' in buildSoulParams('x', 's')).toBe(false)
  })
})

describe('buildSpeakParams', () => {
  it('defaults to high quality and maps audio duration to allowed value', () => {
    const p = buildSpeakParams('http://img', 'http://audio', 'talking head', 7.2)
    expect(p.quality).toBe('high')
    expect(p.duration).toBe(10)
    expect(p.input_image).toEqual({ type: 'image_url', image_url: 'http://img' })
    expect(p.input_audio).toEqual({ type: 'audio_url', audio_url: 'http://audio' })
  })

  it('honors HIGGSFIELD_SPEAK_QUALITY override', () => {
    process.env['HIGGSFIELD_SPEAK_QUALITY'] = 'mid'
    expect(buildSpeakParams('i', 'a', 'p', 3).quality).toBe('mid')
  })
})

describe('buildDopParams', () => {
  it('defaults to dop-standard', () => {
    const p = buildDopParams('http://img', 'pan over product')
    expect(p.model).toBe('dop-standard')
    expect(p.input_images).toEqual([{ type: 'image_url', image_url: 'http://img' }])
  })

  it('honors HIGGSFIELD_DOP_MODEL override and seed', () => {
    process.env['HIGGSFIELD_DOP_MODEL'] = 'dop-turbo'
    const p = buildDopParams('i', 'p', { seed: 7 })
    expect(p.model).toBe('dop-turbo')
    expect(p.seed).toBe(7)
  })
})
