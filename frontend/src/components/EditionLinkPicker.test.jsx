import '@testing-library/jest-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditionLinkPicker from './EditionLinkPicker.jsx'

const ID = '11111111-1111-1111-1111-111111111111'
const HIT = {
  cv_id: 4242,
  volume_name: 'Saga',
  number: '1',
  name: 'Chapter One',
  thumb_url: 'https://example.test/t.jpg',
  year: 2012,
}

function stubApi({ search = [HIT], searchStatus = 200, putStatus = 200 } = {}) {
  const fetch = vi.fn(async (url, options = {}) => {
    if (options.method === 'PUT') {
      return {
        ok: putStatus === 200,
        status: putStatus,
        json: async () =>
          putStatus === 200
            ? { item_id: ID, editions: [{ cv_id: 4242 }] }
            : { detail: 'Comic Vine has no such issue' },
      }
    }
    return {
      ok: searchStatus === 200,
      status: searchStatus,
      json: async () =>
        searchStatus === 200 ? search : { detail: 'Type an issue to find' },
    }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function setup(props = {}) {
  const onLinked = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <EditionLinkPicker
      itemId={ID}
      slug="ed-1-6"
      name="Volume One"
      cvId={null}
      onLinked={onLinked}
      {...props}
    />,
  )
  return { onLinked, user }
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('EditionLinkPicker', () => {
  it('debounces the search, then lists hits', async () => {
    const fetch = stubApi()
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Link to Comic Vine/ }))
    await user.type(screen.getByLabelText('Search Comic Vine'), 'saga')
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/comics/issues/search?q=saga')
    expect(
      await screen.findByRole('button', { name: /Saga #1/ }),
    ).toBeInTheDocument()
  })

  it('PUTs the chosen cv_id and reports the editions', async () => {
    const fetch = stubApi()
    const { user, onLinked } = setup()
    await user.click(screen.getByRole('button', { name: /Link to Comic Vine/ }))
    await user.type(screen.getByLabelText('Search Comic Vine'), 'saga')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await user.click(await screen.findByRole('button', { name: /Saga #1/ }))
    await waitFor(() => expect(onLinked).toHaveBeenCalled())
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(put[0]).toBe(`/api/comics/${ID}/editions/ed-1-6/link`)
    expect(JSON.parse(put[1].body)).toEqual({ cv_id: 4242 })
    expect(onLinked).toHaveBeenCalledWith([{ cv_id: 4242 }])
  })

  it('shows the link and Unlink PUTs null', async () => {
    const fetch = stubApi()
    const { user, onLinked } = setup({ cvId: 4242 })
    expect(screen.getByText(/Linked to Comic Vine/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Unlink/ }))
    await waitFor(() => expect(onLinked).toHaveBeenCalled())
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
    expect(JSON.parse(put[1].body)).toEqual({ cv_id: null })
  })

  it('shows the API detail when the link is refused', async () => {
    stubApi({ putStatus: 422 })
    const { user, onLinked } = setup()
    await user.click(screen.getByRole('button', { name: /Link to Comic Vine/ }))
    await user.type(screen.getByLabelText('Search Comic Vine'), 'saga')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await user.click(await screen.findByRole('button', { name: /Saga #1/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Comic Vine has no such issue',
    )
    expect(onLinked).not.toHaveBeenCalled()
  })

  it('shows the detail when the search is refused', async () => {
    stubApi({ searchStatus: 422 })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Link to Comic Vine/ }))
    await user.type(screen.getByLabelText('Search Comic Vine'), 'saga')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Type an issue to find',
    )
  })

  it('is disabled with a reason for an unsaved edition', () => {
    setup({ disabledReason: 'Save the edition first.' })
    expect(
      screen.getByRole('button', { name: /Link to Comic Vine/ }),
    ).toBeDisabled()
    expect(screen.getByText('Save the edition first.')).toBeInTheDocument()
  })
})
