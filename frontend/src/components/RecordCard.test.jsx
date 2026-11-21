import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CatalogueNumber from './CatalogueNumber.jsx'
import { CARD_SHELL } from './ui/card-classes.js'
import RecordCard from './RecordCard.jsx'
import StatusMark from './StatusMark.jsx'

const box = () => document.querySelector('[data-slot="status-mark-square"]')

describe('CatalogueNumber', () => {
  it('writes No. and a zero-padded number', () => {
    render(<CatalogueNumber n={7} data-testid="no" />)
    expect(screen.getByTestId('no')).toHaveTextContent('No. 007')
  })

  it('is decorative: aria-hidden, so a screen reader skips it', () => {
    render(<CatalogueNumber n={12} data-testid="no" />)
    expect(screen.getByTestId('no')).toHaveAttribute('aria-hidden', 'true')
  })

  it('is mono', () => {
    render(<CatalogueNumber n={1} data-testid="no" />)
    expect(screen.getByTestId('no').className).toContain('font-mono')
  })
})

describe('StatusMark', () => {
  it.each(['live', 'finished'])('fills the mark when %s', (status) => {
    render(<StatusMark status={status}>Word</StatusMark>)
    expect(box()).toHaveAttribute('data-filled', 'true')
    expect(box().className).toContain('bg-highlight')
  })

  it.each(['backlog', 'paused', 'abandoned', 'planned', undefined])(
    'leaves the mark outlined when %s',
    (status) => {
      render(<StatusMark status={status}>Word</StatusMark>)
      expect(box()).toHaveAttribute('data-filled', 'false')
      expect(box().className).not.toContain('bg-highlight')
    },
  )

  it('always shows the word beside the mark', () => {
    render(<StatusMark status="finished">Finished</StatusMark>)
    expect(screen.getByText('Finished')).toBeVisible()
  })

  it('falls back to the status as the word, never a bare mark', () => {
    render(<StatusMark status="live" />)
    expect(screen.getByText('live')).toBeVisible()
  })

  it('hides the square from a screen reader and keeps the word', () => {
    render(<StatusMark status="finished">Finished</StatusMark>)
    expect(box()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Finished')).not.toHaveAttribute('aria-hidden')
  })

  it('outlines in ink and sets the word in a text token, not the mark colour', () => {
    render(<StatusMark status="finished">Finished</StatusMark>)
    expect(box().className).toContain('border-foreground')
    expect(screen.getByText('Finished').parentElement.className).toContain(
      'text-muted-foreground',
    )
  })
})

describe('RecordCard', () => {
  it('shows the catalogue number left and the type right in a label strip', () => {
    render(
      <RecordCard number={3} label="Game" data-testid="card">
        <p>Body</p>
      </RecordCard>,
    )
    const strip = screen.getByTestId('card').querySelector('[data-strip]')
    expect(strip).toHaveTextContent('No. 003')
    expect(strip).toHaveTextContent('Game')
    expect(strip.firstElementChild).toHaveTextContent('No. 003')
    expect(strip.className).toContain('border-line-card')
    expect(strip.className).toContain('font-mono')
  })

  it('has a 3px accent left edge and a flat outline', () => {
    render(<RecordCard number={1} data-testid="card" />)
    const cls = screen.getByTestId('card').className
    expect(cls).toContain('border-l-[3px]')
    expect(cls).toContain('border-l-primary')
    expect(cls).toContain('border-border')
    expect(cls).not.toMatch(/shadow|ring-/)
  })

  it('omits the number when none is given (not a collection)', () => {
    render(<RecordCard label="Note" data-testid="card" />)
    expect(screen.getByTestId('card')).not.toHaveTextContent('No.')
  })

  it('holds its children below the strip', () => {
    render(
      <RecordCard number={1}>
        <h3>Dredge</h3>
      </RecordCard>,
    )
    expect(screen.getByRole('heading', { name: 'Dredge' })).toBeVisible()
  })

  it('draws no placeholder span when there is no number, and holds the label in a block', () => {
    render(<RecordCard label={<h2>At a glance</h2>} data-testid="card" />)
    const strip = screen.getByTestId('card').querySelector('[data-strip]')
    expect(strip.children).toHaveLength(1)
    expect(strip.firstElementChild.tagName).toBe('DIV')
    expect(
      screen.getByRole('heading', { name: 'At a glance' }).closest('span'),
    ).toBeNull()
  })

  it('takes its look from the shared card class constant', () => {
    render(<RecordCard number={1} data-testid="card" />)
    const cls = screen.getByTestId('card').className
    for (const part of CARD_SHELL.split(' ')) expect(cls).toContain(part)
  })
})
