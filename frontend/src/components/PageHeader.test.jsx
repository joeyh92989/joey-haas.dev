import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PageHeader from './PageHeader.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const trail = [{ label: 'Blog', to: '/blog' }, { label: 'A post' }]

function renderHeader(props) {
  return render(
    <MemoryRouter>
      <PageHeader trail={trail} title="A post" {...props} />
    </MemoryRouter>,
  )
}

describe('PageHeader', () => {
  it('opens with the breadcrumb, then one h1', () => {
    renderHeader()
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: 'A post' }),
    ).toBeInTheDocument()
  })

  it('draws no breadcrumb row for a list page, which passes no trail', () => {
    renderHeader({ trail: undefined })
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'A post' }),
    ).toBeInTheDocument()
  })

  it('renders the kicker and lede only when given', () => {
    const { container, rerender } = renderHeader()
    expect(container.querySelector('.kicker')).toBeNull()
    expect(container.querySelector('.lede')).toBeNull()
    rerender(
      <MemoryRouter>
        <PageHeader
          trail={trail}
          title="A post"
          kicker="May 2026"
          lede="Why."
        />
      </MemoryRouter>,
    )
    expect(container.querySelector('.kicker')).toHaveTextContent('May 2026')
    expect(container.querySelector('.lede')).toHaveTextContent('Why.')
  })

  it('takes a lede class', () => {
    const { container } = renderHeader({
      lede: 'Why.',
      ledeClassName: 'post-summary',
    })
    expect(container.querySelector('p.post-summary')).toHaveTextContent('Why.')
  })

  it('has no axe violations', async () => {
    const { container } = renderHeader()
    expect(await axeViolations(container)).toEqual([])
  })
})
