import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePageTitle } from './usePageTitle.js'

function Page({ title }) {
  usePageTitle(title)
  return null
}

afterEach(() => {
  document.title = ''
})

describe('usePageTitle', () => {
  it('sets the title', () => {
    render(<Page title="About · Joey Haas" />)
    expect(document.title).toBe('About · Joey Haas')
  })

  it('follows a changed title', () => {
    const { rerender } = render(<Page title="Spine · Joey Haas" />)
    rerender(<Page title="Hades · Spine" />)
    expect(document.title).toBe('Hades · Spine')
  })

  // A page that renders NotFound passes null, so NotFound's own title stands.
  it('leaves the title alone when given null', () => {
    document.title = 'Not found · Joey Haas'
    render(<Page title={null} />)
    expect(document.title).toBe('Not found · Joey Haas')
  })
})
