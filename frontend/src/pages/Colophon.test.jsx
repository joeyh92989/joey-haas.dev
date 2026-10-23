import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import Colophon from './Colophon.jsx'

/** The display name of each @fontsource package the site may ship. */
const FAMILY_NAMES = {
  inter: 'Inter',
  'jetbrains-mono': 'JetBrains Mono',
  'source-serif-4': 'Source Serif 4',
}

// main.jsx as text, not executed: its @fontsource imports are the fonts
// the site actually ships.
const { '../main.jsx': main } = import.meta.glob('../main.jsx', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The font packages main.jsx imports. */
function shippedFamilies() {
  const packages = [...main.matchAll(/@fontsource\/([a-z0-9-]+)\//g)].map(
    (match) => match[1],
  )
  return [...new Set(packages)]
}

describe('Colophon', () => {
  it('names every font the site ships', () => {
    render(
      <MemoryRouter>
        <Colophon />
      </MemoryRouter>,
    )
    const families = shippedFamilies()
    expect(families.length).toBeGreaterThan(0)
    for (const family of families) {
      // A new package needs its name here and a mention on the page.
      expect(FAMILY_NAMES).toHaveProperty(family)
      expect(
        screen.getByText(new RegExp(FAMILY_NAMES[family])),
      ).toBeInTheDocument()
    }
  })

  it('says how the analytics count, and that nothing goes to a third party', () => {
    render(
      <MemoryRouter>
        <Colophon />
      </MemoryRouter>,
    )
    expect(
      screen.getByText(/cookie-free beacon counts page views/),
    ).toHaveTextContent(/Nothing goes to a third\s+party/)
  })
})
