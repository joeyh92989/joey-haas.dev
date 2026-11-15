import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { profile } from './content/profile.js'

const text = fs.readFileSync('public/.well-known/security.txt', 'utf8')

describe('security.txt', () => {
  it('names the footer contact', () => {
    expect(text).toContain(`Contact: mailto:${profile.email}`)
  })

  it('expires in the future, within a year of today', () => {
    const expires = new Date(/^Expires: (.+)$/m.exec(text)[1])
    const now = Date.now()
    expect(expires.getTime()).toBeGreaterThan(now)
    expect(expires.getTime() - now).toBeLessThan(366 * 24 * 3600 * 1000)
  })
})
