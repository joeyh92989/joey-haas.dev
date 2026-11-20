import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import EmptyState from './EmptyState.jsx'

function show(props) {
  return render(
    <MemoryRouter>
      <EmptyState {...props} />
    </MemoryRouter>,
  )
}

describe('EmptyState', () => {
  it('says what is missing', () => {
    show({ title: 'No games on the shelf yet.' })
    expect(screen.getByText('No games on the shelf yet.')).toBeInTheDocument()
  })

  it('adds a second line when given one', () => {
    show({ title: 'Nothing here.', line: 'Add one from the admin.' })
    expect(screen.getByText('Add one from the admin.')).toBeInTheDocument()
  })

  it('offers the next step as a link', () => {
    show({
      title: 'Nothing here.',
      action: { to: '/shelf/next', label: 'See what is next' },
    })
    expect(
      screen.getByRole('link', { name: 'See what is next' }),
    ).toHaveAttribute('href', '/shelf/next')
  })

  it('offers the next step as a button when it has a handler', async () => {
    const calls = []
    show({
      title: 'Nothing here.',
      action: { onClick: () => calls.push(1), label: 'Clear filters' },
    })
    screen.getByRole('button', { name: 'Clear filters' }).click()
    expect(calls).toEqual([1])
  })

  it('draws no action when none is given', () => {
    show({ title: 'Nothing here.' })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a flat outlined card on the card colour, still the empty-state box', () => {
    const { container } = show({ title: 'Nothing here.' })
    const box = container.querySelector('.empty-state')
    expect(box.className).toContain('border-border')
    expect(box.className).toContain('bg-card')
    expect(box.className).not.toMatch(/shadow|rounded-4xl/)
  })

  it('draws the button action as the shared Button, keeping btn sm', () => {
    show({ title: 'Nothing here.', action: { onClick: () => {}, label: 'Go' } })
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toHaveClass('btn', 'sm', 'empty-state-action')
    expect(button.className).toContain('border-foreground')
  })

  it('draws the link action in the link-button look, with no role added', () => {
    show({ title: 'Nothing here.', action: { to: '/x', label: 'Go' } })
    const link = screen.getByRole('link', { name: 'Go' })
    expect(link).toHaveClass('empty-state-action')
    expect(link.className).toContain('text-accent-text')
    expect(link).not.toHaveAttribute('role')
  })

  it('keeps the old 16px size and the --text-2 colour', () => {
    const { container } = show({ title: 'Nothing here.' })
    const box = container.querySelector('.empty-state')
    expect(box.className).toContain('text-base')
    expect(box.className).toContain('text-muted-foreground')
  })
})
