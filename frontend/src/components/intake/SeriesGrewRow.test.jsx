import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { seriesGrowth } from '../../lib/comicRun.js'
import SeriesGrewRow from './SeriesGrewRow.jsx'

const growth = (issues) =>
  seriesGrowth({ ownedText: '1–2, 5', issues, released: 6 })

function row(props) {
  return render(
    <MemoryRouter>
      <ul>
        <SeriesGrewRow title="Waterworld" growth={growth('3')} {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('SeriesGrewRow', () => {
  it('names every issue already held when a row adds nothing', () => {
    row({ growth: growth('1, 5') })
    expect(
      screen.getByText('#1, #5 are already on the shelf · nothing to add'),
    ).toBeVisible()
  })

  it('says which issues are added and which were held already', () => {
    const { container } = row({ growth: growth('2-3') })
    expect(container).toHaveTextContent(
      'adds #3 · 3 of 6 → 4 of 6 2 missing · #2 already on the shelf',
    )
    // Three before and two after #3, from #1, then a gap before #6.
    const cells = [...container.querySelectorAll('.run-cell')]
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '1',
      '2',
      '+3',
      '4',
      '5',
      '…',
    ])
  })

  it('keeps what was typed when Edit issues is cancelled', async () => {
    const user = userEvent.setup()
    const onSaveIssues = vi.fn()
    row({ issuesText: '3', onSaveIssues })
    await user.click(
      screen.getByRole('button', { name: 'Edit issues of Waterworld' }),
    )
    await user.type(screen.getByLabelText(/Issues of Waterworld/), '-4')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSaveIssues).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Edit issues of Waterworld' }),
    ).toHaveFocus()
  })
})
