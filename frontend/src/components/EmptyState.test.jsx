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
})
