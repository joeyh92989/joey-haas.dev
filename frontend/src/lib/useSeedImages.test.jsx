import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeIntakeApi } from './intake.test-util.js'
import { useSeedImages } from './useSeedImages.js'

const piece = (id, url = `https://cdn.test/${id}.jpg`) => ({
  id,
  payload: { image: 'pending', seed: { image_url: url } },
})

afterEach(() => vi.unstubAllGlobals())

describe('useSeedImages', () => {
  it('asks until the server has nothing pending, in one run', async () => {
    const left = [2, 1, 0]
    const api = fakeIntakeApi({
      seedImages: () => {
        const pending = left.shift()
        return { entries: pending === 0 ? [] : [{ id: 'x' }], pending }
      },
    })
    const onEntry = vi.fn()
    renderHook(() =>
      useSeedImages({ id: 's1' }, [piece('a'), piece('b')], onEntry),
    )
    await waitFor(() =>
      expect(api.calls('POST', /seed-images$/)).toHaveLength(3),
    )
  })

  it('runs again when a piece gets another photo though the count is the same', async () => {
    const api = fakeIntakeApi({
      seedImages: () => ({ entries: [], pending: 0 }),
    })
    const { rerender } = renderHook(
      ({ entries }) => useSeedImages({ id: 's1' }, entries, vi.fn()),
      { initialProps: { entries: [piece('a', 'https://cdn.test/red.jpg')] } },
    )
    await waitFor(() =>
      expect(api.calls('POST', /seed-images$/)).toHaveLength(1),
    )
    rerender({ entries: [piece('a', 'https://cdn.test/blue.jpg')] })
    await waitFor(() =>
      expect(api.calls('POST', /seed-images$/)).toHaveLength(2),
    )
  })

  it('does nothing when another loop owns the sitting', async () => {
    const api = fakeIntakeApi()
    renderHook(() => useSeedImages({ id: 's1' }, [piece('a')], vi.fn(), false))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.calls('POST', /seed-images$/)).toHaveLength(0)
  })
})
