import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalyticsBeacon } from './useAnalyticsBeacon.js'

const media = vi.hoisted(() => ({ matches: {} }))
vi.mock('./useMediaQuery.js', () => ({
  useMediaQuery: (query) => Boolean(media.matches[query]),
}))

let beacon

function setNavigator(key, value) {
  Object.defineProperty(navigator, key, { value, configurable: true })
}

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

/** The hook at a path and session, re-rendered by `go`. */
function mount(pathname, signedIn = false) {
  const { rerender } = renderHook(
    ({ path, session }) => useAnalyticsBeacon(path, session),
    { initialProps: { path: pathname, session: signedIn } },
  )
  return (path, session = false) => rerender({ path, session })
}

const bodies = () => beacon.mock.calls.map(([, body]) => JSON.parse(body))

beforeEach(() => {
  beacon = vi.fn(() => true)
  setNavigator('sendBeacon', beacon)
  setNavigator('globalPrivacyControl', undefined)
  setNavigator('doNotTrack', null)
  setReferrer('')
  media.matches = {}
})

afterEach(() => {
  delete navigator.sendBeacon
  delete navigator.globalPrivacyControl
  delete navigator.doNotTrack
  delete document.referrer
})

describe('useAnalyticsBeacon', () => {
  it('sends one beacon per route change, with exactly path, ref and device', () => {
    const go = mount('/')
    go('/about')
    go('/shelf')
    expect(beacon).toHaveBeenCalledTimes(3)
    expect(beacon.mock.calls[0][0]).toMatch(/\/api\/track$/)
    expect(bodies()).toEqual([
      { path: '/', ref: '', device: 'desktop' },
      { path: '/about', ref: null, device: 'desktop' },
      { path: '/shelf', ref: null, device: 'desktop' },
    ])
  })

  it('sends nothing again on a re-render of the same path', () => {
    const go = mount('/')
    go('/')
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('waits for the session check, then sends once signed out', () => {
    const go = mount('/', null)
    expect(beacon).not.toHaveBeenCalled()
    go('/', false)
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('sends nothing while signed in', () => {
    const go = mount('/', true)
    go('/about', true)
    expect(beacon).not.toHaveBeenCalled()
  })

  it('sends nothing on the admin', () => {
    const go = mount('/admin')
    go('/admin/collection')
    expect(beacon).not.toHaveBeenCalled()
    go('/administer')
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('sends nothing with Global Privacy Control or Do Not Track', () => {
    setNavigator('globalPrivacyControl', true)
    mount('/')
    setNavigator('globalPrivacyControl', undefined)
    setNavigator('doNotTrack', '1')
    mount('/about')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('does nothing where sendBeacon is missing', () => {
    setNavigator('sendBeacon', undefined)
    expect(() => mount('/')).not.toThrow()
  })

  it('sends the referring host on the first view only, never this site', () => {
    setReferrer('https://news.example.com/item?id=1')
    const go = mount('/')
    go('/about')
    expect(bodies().map((body) => body.ref)).toEqual(['news.example.com', null])

    beacon.mockClear()
    setReferrer(`${window.location.origin}/about`)
    mount('/now')
    expect(bodies()[0].ref).toBe('')
  })

  it('classes the device from the pointer and the width', () => {
    media.matches = { '(pointer: coarse)': true, '(max-width: 700px)': true }
    mount('/')
    media.matches = { '(pointer: coarse)': true }
    mount('/about')
    expect(bodies().map((body) => body.device)).toEqual(['phone', 'tablet'])
  })
})
