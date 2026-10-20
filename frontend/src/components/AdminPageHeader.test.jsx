import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AdminPageHeader from './AdminPageHeader.jsx'

describe('AdminPageHeader', () => {
  it('names the page and sets the admin title pattern', () => {
    render(<AdminPageHeader title="Shelf" description="Everything I own." />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Shelf' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Everything I own.')).toBeInTheDocument()
    expect(document.title).toBe('Shelf · Admin · Joey Haas')
  })

  it('puts its children in the right-hand slot', () => {
    const { container } = render(
      <AdminPageHeader title="Radar">
        <button type="button">Generate</button>
      </AdminPageHeader>,
    )
    expect(container.querySelector('.admin-head-end')).toContainElement(
      screen.getByRole('button', { name: 'Generate' }),
    )
  })

  it('renders no empty slot or description', () => {
    const { container } = render(<AdminPageHeader title="Radar" />)
    expect(container.querySelector('.admin-head-end')).toBeNull()
    expect(container.querySelector('.admin-head-desc')).toBeNull()
  })
})
