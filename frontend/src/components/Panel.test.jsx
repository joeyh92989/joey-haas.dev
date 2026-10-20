import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Panel from './Panel.jsx'

describe('Panel', () => {
  it('is a region named by its heading, with the action in its header', () => {
    render(
      <Panel title="Nightly jobs" action={<a href="/x">Run now</a>}>
        <p>Body</p>
      </Panel>,
    )
    const region = screen.getByRole('region', { name: 'Nightly jobs' })
    expect(region).toHaveTextContent('Body')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nightly jobs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Run now' })).toBeInTheDocument()
  })
})
