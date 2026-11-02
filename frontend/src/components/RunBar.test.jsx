import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import RunBadge from './RunBadge.jsx'
import RunBar, { RunLegend } from './RunBar.jsx'

const SEGMENTS = [
  { kind: 'owned', length: 50 },
  { kind: 'missing', length: 22 },
  { kind: 'upcoming', length: 7 },
]

describe('RunBar', () => {
  it('draws the segments in order, each grown by its length', () => {
    const { container } = render(
      <RunBar segments={SEGMENTS} owned={50} released={72} ongoing />,
    )
    const bar = screen.getByRole('img', {
      name: '50 of 72 issues owned, ongoing',
    })
    const fills = [...bar.querySelectorAll('i')]
    expect(fills.map((i) => i.dataset.k)).toEqual([
      'owned',
      'missing',
      'upcoming',
    ])
    expect(fills.map((i) => i.style.flexGrow)).toEqual(['50', '22', '7'])
    expect(container.firstChild).toHaveClass('run')
  })

  it('names the three fills once in the legend', async () => {
    const { container } = render(<RunLegend />)
    const legend = screen.getByRole('list', { name: 'Run bar key' })
    expect(legend).toHaveTextContent('Owned')
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('RunBadge', () => {
  it('shows the count, marked complete for a finished run', () => {
    render(
      <RunBadge
        row={{ owned: 12, released: 12, ongoing: false, run_state: 'complete' }}
      />,
    )
    const badge = screen.getByRole('img', { name: '12 of 12 issues owned' })
    expect(badge).toHaveTextContent('12/12')
    expect(badge).toHaveAttribute('data-complete')
  })

  it('says Want for a want, with no run', () => {
    const { container } = render(<RunBadge row={{ wanted: true }} />)
    expect(container.textContent).toBe('Want')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
