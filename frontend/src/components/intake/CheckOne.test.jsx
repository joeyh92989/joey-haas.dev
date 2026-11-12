import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { candidate, entry, fakeIntakeApi } from '../../lib/intake.test-util.js'
import CheckOne from './CheckOne.jsx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CheckOne', () => {
  it('shows a probable entry with its badge and its candidate preselected', () => {
    const best = candidate(2, 'Saga', 2012)
    render(
      <CheckOne
        entry={entry('e1', 'probable', {
          payload: { detected_title: 'SAGA' },
          candidates: [candidate(1, 'Sagas', 2001), best],
          chosen: best,
        })}
        photoNumber={1}
        position="1 of 1"
        onAnswer={vi.fn()}
        onSkip={vi.fn()}
        busy={false}
      />,
    )
    expect(screen.getByText('Probable')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Saga 2012/ })).toBeChecked()
  })

  it('searches the entry’s kind for a better match and answers with it', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({
      search: () => ({
        results: [
          {
            kind: 'game',
            external_source: 'igdb',
            external_id: '9',
            title: 'Sandman game',
            year: 2020,
            thumbnail_url: null,
            owned_item_id: null,
          },
          {
            kind: 'comic',
            external_source: 'comicvine',
            external_id: '77',
            title: 'The Sandman',
            year: 1989,
            thumbnail_url: null,
            owned_item_id: null,
          },
        ],
        sources: [],
      }),
    })
    const onAnswer = vi.fn()
    render(
      <CheckOne
        entry={entry('e1', 'check', {
          payload: { detected_title: 'SANDMAN' },
          candidates: [candidate(1, 'Sandman Universe', 2018)],
        })}
        photoNumber={2}
        position="1 of 1"
        onAnswer={onAnswer}
        onSkip={vi.fn()}
        busy={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Search…' }))
    const field = screen.getByRole('searchbox', {
      name: 'Search for this title',
    })
    expect(field).toHaveValue('SANDMAN')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const found = await screen.findByRole('radio', { name: /The Sandman/ })
    expect(found).toBeChecked()
    expect(screen.queryByRole('radio', { name: /Sandman game/ })).toBeNull()
    expect(api.calls('GET', /\/api\/intake\/search/)[0].url).toBe(
      '/api/intake/search?area=shelf&query=SANDMAN',
    )
    await user.click(screen.getByRole('button', { name: 'Yes, this one' }))
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith(expect.anything(), {
        state: 'ready',
        chosen: expect.objectContaining({ external_id: '77' }),
      }),
    )
  })
})
