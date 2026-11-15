import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const yaml = fs.readFileSync(path.join(here, '..', '..', 'render.yaml'), 'utf8')
const site = yaml.split('# Python API')[0]

function header(name, route = '/*') {
  const pattern = new RegExp(
    `- path: ${route.replace('*', '\\*')}\\n\\s+name: ${name}\\n\\s+value: (.+)`,
  )
  return site.match(pattern)?.[1]
}

describe('render.yaml static site headers', () => {
  it('caches hashed assets for a year, immutable, and nothing else', () => {
    expect(header('Cache-Control', '/assets/*')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(header('Cache-Control')).toBeUndefined()
  })

  it('sends HSTS, a referrer policy and a permissions policy', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('Permissions-Policy')).toMatch(
      /camera=\(\).*geolocation=\(\)/,
    )
  })

  it('hashes the pre-paint theme script in the report-only CSP', () => {
    const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8')
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    expect(inline).toHaveLength(1)
    const hash = crypto
      .createHash('sha256')
      .update(inline[0][1])
      .digest('base64')
    expect(header('Content-Security-Policy-Report-Only')).toContain(
      `'sha256-${hash}'`,
    )
  })
})
