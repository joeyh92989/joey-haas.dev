import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useHashFocus } from './useHashFocus.js'

function Page() {
  useHashFocus()
  return (
    <>
      <Link to="#stop-2">Go to two</Link>
      <section id="stop-1">
        <h2>One</h2>
      </section>
      <section id="stop-2">
        <h2>Two</h2>
      </section>
    </>
  )
}

function renderAt(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Page />
    </MemoryRouter>,
  )
}

describe('useHashFocus', () => {
  it('focuses the section heading named by the hash on mount', () => {
    renderAt('/spine/how#stop-1')
    const heading = screen.getByRole('heading', { name: 'One' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('follows a hash link on the same page', () => {
    renderAt('/spine/how')
    expect(document.body).toHaveFocus()
    act(() => screen.getByRole('link', { name: 'Go to two' }).click())
    expect(screen.getByRole('heading', { name: 'Two' })).toHaveFocus()
  })

  it('does nothing for an id that is not on the page', () => {
    renderAt('/spine/how#stop-9')
    expect(document.body).toHaveFocus()
  })

  it('survives a malformed hash', () => {
    renderAt('/spine/how#%E0%A4%A')
    expect(document.body).toHaveFocus()
  })
})
