import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { MAX_GUESSES, dailyPool, picksThrough } from '../lib/daily.js'
import { STORAGE_KEY } from '../lib/dailyStorage.js'
import { ownerDay } from '../lib/formatDate.js'
import { readSnapshot } from '../lib/snapshot.js'
import Daily from './Daily.jsx'

vi.mock('../lib/dailyConfig.js', () => ({ DAILY_SALT: 'test' }))
vi.mock('../lib/snapshot.js', async (importOriginal) => ({
  ...(await importOriginal()),
  readSnapshot: vi.fn(),
}))

const TITLES = [
  'Astral Chain',
  'Bayonetta 3',
  'Celeste',
  'Dead Cells',
  'Hades',
  'Metroid Dread',
  'Octopath Traveler',
  'Pikmin 4',
  'Sea of Stars',
  'Tunic',
]

const ITEMS = [
  ...TITLES.map((title, index) => ({
    id: index + 1,
    type: 'game',
    title,
    wanted: false,
    platform: index % 2 ? 'Nintendo Switch' : 'Nintendo Switch 2',
    year: 2015 + index,
    release_date: `${2015 + index}-05-01`,
    genres: index % 3 ? ['Adventure'] : ['Platform', 'Indie'],
    time_to_beat_hours: 4 + index * 3,
  })),
  // Never in the pool: a want, a book, and a game with no size.
  { id: 90, type: 'game', title: 'Wanted Game', wanted: true },
  { id: 91, type: 'book', title: 'A Book' },
  { id: 92, type: 'game', title: 'No Size', platform: 'PC', year: 2020 },
]

// Noon in Denver on 12 November 2026: day 3 from the epoch.
const NOON = new Date('2026-11-12T19:00:00Z')

function picks() {
  return picksThrough(ownerDay(), dailyPool(ITEMS), 'test')
}

function answer() {
  return picks().at(-1).item
}

function wrong(count) {
  return dailyPool(ITEMS)
    .filter((item) => item.id !== answer().id)
    .slice(0, count)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Daily />
    </MemoryRouter>,
  )
}

async function guess(user, title) {
  const box = screen.getByRole('combobox', { name: 'Your guess' })
  await user.clear(box)
  await user.type(box, `${title}{Enter}`)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOON)
  vi.mocked(readSnapshot).mockReset()
  vi.mocked(readSnapshot).mockImplementation(async (name) =>
    name === 'items' ? ITEMS : null,
  )
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('Daily', () => {
  it('opens on an empty board for today, reading only the snapshot', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { container } = renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Shelfle' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Day 3 · 12 Nov')).toBeInTheDocument()
    expect(screen.getByText(/Guess the game on my shelf in six/)).toBeVisible()
    expect(screen.getByRole('table')).toHaveAccessibleName(
      `0 of ${MAX_GUESSES} guesses`,
    )
    // No streak row before the first finished day.
    expect(screen.queryByText('Streak')).toBeNull()
    expect(readSnapshot).toHaveBeenCalledWith('items')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
    fetchSpy.mockRestore()
  })

  it('grades a miss, announces it and keeps it for a reload', async () => {
    const user = userEvent.setup()
    const [miss] = wrong(1)
    const { unmount } = renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, miss.title)

    expect(screen.getByRole('status')).toHaveTextContent(
      `Guess 1, ${miss.title}, graded.`,
    )
    const table = screen.getByRole('table')
    expect(table).toHaveAccessibleName(`1 of ${MAX_GUESSES} guesses`)
    expect(within(table).getByText(miss.title)).toBeInTheDocument()
    expect(screen.getByText(`Guess 2 of ${MAX_GUESSES}`)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).days[3]).toEqual({
      guesses: [miss.id],
      won: null,
    })

    unmount()
    renderPage()
    expect(
      await within(await screen.findByRole('table')).findByText(miss.title),
    ).toBeInTheDocument()
  })

  it('takes a guessed title out of the suggestions', async () => {
    const user = userEvent.setup()
    const [miss] = wrong(1)
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, miss.title)
    await user.type(screen.getByRole('combobox'), miss.title.slice(0, 4))
    expect(
      screen.queryByRole('option', { name: new RegExp(miss.title) }),
    ).toBeNull()
  })

  it('wins: shows the answer, the streak, and closes the input', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, answer().title)

    expect(screen.getByRole('status')).toHaveTextContent('Solved in 1.')
    expect(
      screen.getByRole('heading', { name: 'Got it in 1.' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Streak').parentElement).toHaveTextContent(
      'Streak 1',
    )
    expect(
      screen.getByRole('link', { name: 'See it on the shelf' }),
    ).toHaveAttribute('href', `/shelf/${answer().id}/`)
    expect(await axeViolations(container)).toEqual([])
  })

  it('moves focus to the outcome when the game ends, not on a restored day', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, answer().title)
    expect(screen.getByRole('heading', { name: 'Got it in 1.' })).toHaveFocus()

    unmount()
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Got it in 1.' })
    expect(heading).not.toHaveFocus()
  })

  it('loses after six misses and names the answer', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    for (const item of wrong(MAX_GUESSES)) await guess(user, item.title)

    expect(screen.getByRole('status')).toHaveTextContent(
      `Out of guesses. The answer was ${answer().title}.`,
    )
    expect(
      screen.getByRole('heading', {
        name: `Not today. It was ${answer().title}.`,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Streak').parentElement).toHaveTextContent(
      'Streak 0',
    )
  })

  it('says so when a typed title is not on the shelf', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, 'Zelda Nonexistent')
    expect(screen.getByRole('status')).toHaveTextContent('Not on the shelf.')
    expect(screen.getByRole('table')).toHaveAccessibleName(
      `0 of ${MAX_GUESSES} guesses`,
    )
  })

  it("links yesterday's answer", async () => {
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    const yesterday = picks().at(-2).item
    expect(screen.getByText('Yesterday’s answer:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: yesterday.title })).toHaveAttribute(
      'href',
      `/shelf/${yesterday.id}/`,
    )
  })

  it('has no Yesterday line on day one', async () => {
    vi.setSystemTime(new Date('2026-11-10T19:00:00Z'))
    renderPage()
    await screen.findByText('Day 1 · 10 Nov')
    expect(screen.queryByText('Yesterday’s answer:')).toBeNull()
  })

  it('rolls over to the next day when the tab is looked at again', async () => {
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    vi.setSystemTime(new Date('2026-11-13T19:00:00Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByText('Day 4 · 13 Nov')).toBeInTheDocument()
  })

  it('shows the empty line when there is no snapshot', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/No puzzle today/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('survives a throwing localStorage', async () => {
    const user = userEvent.setup()
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    renderPage()
    await screen.findByText('Day 3 · 12 Nov')
    await guess(user, answer().title)
    expect(
      screen.getByRole('heading', { name: 'Got it in 1.' }),
    ).toBeInTheDocument()
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
