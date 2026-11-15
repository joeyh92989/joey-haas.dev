import { describe, expect, it } from 'vitest'
import { readingMinutes } from './readingTime.js'

const words = (n) => Array(n).fill('word').join(' ')

describe('readingMinutes', () => {
  it('is at least one minute', () => {
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes(words(5))).toBe(1)
  })

  it('rounds up at 220 words a minute', () => {
    expect(readingMinutes(words(220))).toBe(1)
    expect(readingMinutes(words(221))).toBe(2)
    expect(readingMinutes(words(2500))).toBe(12)
  })

  it('leaves fenced code out', () => {
    const text = `${words(10)}\n\n\`\`\`js\n${words(1000)}\n\`\`\`\n`
    expect(readingMinutes(text)).toBe(1)
  })
})
