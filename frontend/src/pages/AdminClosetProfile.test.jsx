import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminClosetProfile from './AdminClosetProfile.jsx'

const PROFILE = {
  sizes: { top: 'M' },
  coloring: {},
  build_fit: null,
  style_words: ['minimal'],
  dislikes: [],
  weekly_occasions: [
    'office',
    'office',
    'wfh',
    'office',
    'wfh',
    'weekend',
    'weekend',
  ],
  weekly_bike: [false, false, false, false, false, false, false],
  spring_turn: '04-25',
  autumn_turn: '10-01',
  repeat_top_days: 7,
  repeat_outfit_weeks: 3,
  tag_budget: 12,
  occasions: ['office', 'wfh', 'date', 'weekend', 'travel', 'event'],
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('AdminClosetProfile', () => {
  it('sends the whole profile as one PATCH', async () => {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        const method = options.method ?? 'GET'
        const body = options.body ? JSON.parse(options.body) : undefined
        calls.push({ method, url: String(url), body })
        return json(method === 'PATCH' ? { ...PROFILE, ...body } : PROFILE)
      }),
    )
    render(
      <MemoryRouter>
        <AdminClosetProfile />
      </MemoryRouter>,
    )
    const dislikes = await screen.findByLabelText(/^Dislikes/)
    await userEvent.type(dislikes, 'logos, skinny fits')
    await userEvent.selectOptions(screen.getByLabelText('Fri occasion'), 'date')
    await userEvent.click(screen.getAllByLabelText('Bike')[0])
    const budget = screen.getByLabelText(/^Photos tagged a night/)
    await userEvent.clear(budget)
    await userEvent.type(budget, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.url).toMatch(/\/api\/closet\/profile$/)
    expect(patch.body).toMatchObject({
      style_words: ['minimal'],
      dislikes: ['logos', 'skinny fits'],
      weekly_occasions: [
        'office',
        'office',
        'wfh',
        'office',
        'date',
        'weekend',
        'weekend',
      ],
      weekly_bike: [true, false, false, false, false, false, false],
      tag_budget: 0,
      repeat_top_days: 7,
      build_fit: null,
    })
    expect(patch.body.sizes.top).toBe('M')
  })
})
