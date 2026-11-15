import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve('src')
const MODULE = join(ROOT, 'lib', 'formatDate.js')
const INLINE = /Intl\.DateTimeFormat|toLocale(Date|Time)String|dateStyle/

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('date formats', () => {
  it('are built only in lib/formatDate.js', () => {
    const offenders = sources(ROOT).filter(
      (path) => path !== MODULE && INLINE.test(readFileSync(path, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
