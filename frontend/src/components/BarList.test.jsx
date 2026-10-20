import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarList from './BarList.jsx'

describe('BarList', () => {
  it('scales each bar to the largest count and reads label then number', () => {
    const { container } = render(
      <BarList
        label="Referrers by visitors"
        rows={[
          { value: '', count: 10 },
          { value: 'x.com', count: 40 },
        ]}
        name={(value) => value || 'Direct / none'}
      />,
    )
    const list = screen.getByRole('list', { name: 'Referrers by visitors' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Direct / none10',
      'x.com40',
    ])
    const fills = container.querySelectorAll('.bar-list-fill')
    expect([...fills].map((fill) => fill.style.width)).toEqual(['25%', '100%'])
    expect(container.querySelector('.bar-list-track')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('says so when there is nothing to list', () => {
    render(<BarList label="Pages by views" rows={[]} />)
    expect(screen.getByText('None yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
