import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { runModel } from '../lib/comicRun.js'
import RunBox from './RunBox.jsx'

const box = () => document.querySelector('.run-box')

describe('RunBox', () => {
  it('opens a bundle and folds it again by keyboard', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <RunBox model={runModel({ singles: '1–20', released: 32 })} />,
    )
    const bundle = screen.getByRole('button', {
      name: 'Issues 1 to 20, 20 unread. Show each issue',
    })
    expect(bundle).toHaveAttribute('aria-expanded', 'false')
    bundle.focus()
    await user.keyboard('{Enter}')

    const fold = screen.getByRole('button', { name: 'Fold issues 1 to 20' })
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(fold).toHaveFocus()
    expect(box().querySelectorAll('.run-cell[data-k="owned"]')).toHaveLength(20)

    await user.keyboard(' ')
    const again = screen.getByRole('button', {
      name: 'Issues 1 to 20, 20 unread. Show each issue',
    })
    expect(again).toHaveFocus()
    expect(await axeViolations(container)).toEqual([])
  })

  it('renders a run over 300 issues as its box', () => {
    render(
      <RunBox
        model={runModel({
          singles: '1–100, 150, 200, 220–225, 300–312',
          readTo: 100,
          released: 362,
          ongoing: true,
        })}
      />,
    )
    expect(box().children).toHaveLength(15)
  })

  it('hides public cells and books from assistive tech', () => {
    render(
      <RunBox
        model={runModel({
          singles: '1–8',
          editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
          readTo: 3,
          released: 9,
        })}
      />,
    )
    const book = box().querySelector('.run-book')
    expect(book).toHaveTextContent('Vol. 11–6 · read to 3')
    expect(book).toHaveAttribute('aria-hidden', 'true')
    expect(
      box().querySelectorAll('.run-cell[aria-hidden="true"]'),
    ).toHaveLength(3)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    // Nothing to operate: decoration, not an empty labelled group.
    expect(box()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('never draws a skip it was not given', () => {
    render(<RunBox model={runModel({ singles: '1, 3', released: 3 })} />)
    expect(box().querySelector('[data-k="skip"]')).toBeNull()
  })

  it('names every admin cell and keeps books out of the buttons', async () => {
    const onCell = vi.fn()
    const user = userEvent.setup()
    render(
      <RunBox
        mode="edit"
        onCell={onCell}
        model={runModel({
          singles: '7',
          skipped: '8',
          editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
          released: 9,
        })}
      />,
    )
    expect(
      screen.getAllByRole('button').map((button) => button.ariaLabel),
    ).toEqual([
      'Issue 7, Owned, unread',
      'Issue 8, Skipped',
      'Issue 9, Missing',
    ])
    expect(screen.queryByRole('button', { name: /Vol\. 1/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Issue 9, Missing' }))
    expect(onCell).toHaveBeenCalledWith(expect.objectContaining({ n: 9 }))
  })

  it('keeps a tapped issue open when its stretch would bundle', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [singles, setSingles] = useState('7')
      return (
        <RunBox
          mode="edit"
          model={runModel({ singles, released: 13 })}
          onCell={() => setSingles('')}
        />
      )
    }
    render(<Harness />)
    const cell = screen.getByRole('button', { name: 'Issue 7, Owned, unread' })
    await user.click(cell)
    // 1–13 are now all missing: open, with a fold, never a bundle.
    expect(
      screen.getByRole('button', { name: 'Issue 7, Missing' }),
    ).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Fold issues 1 to 13' }),
    ).toBeInTheDocument()
  })

  it('toggles owned singles signed in, and ignores taps while saving', async () => {
    const onCell = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <RunBox
        mode="toggle"
        onCell={onCell}
        model={runModel({ singles: '1', released: 2 })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Issue 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Issue 2' }))
    expect(onCell).toHaveBeenCalledTimes(1)
    rerender(
      <RunBox
        mode="toggle"
        busy
        onCell={onCell}
        model={runModel({ singles: '1', released: 2 })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Issue 2' }))
    expect(onCell).toHaveBeenCalledTimes(1)
  })

  it('ends with the next dated issue, hatched', () => {
    render(
      <RunBox
        model={runModel({
          singles: '1–3',
          released: 3,
          ongoing: true,
          nextIssue: { number: '4', store_date: '2026-12-02' },
        })}
      />,
    )
    const last = box().lastElementChild
    expect(last).toHaveAttribute('data-k', 'upcoming')
    expect(last).toHaveTextContent('4')
  })
})
