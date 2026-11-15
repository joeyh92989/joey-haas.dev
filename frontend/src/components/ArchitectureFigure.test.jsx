import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ArchitectureFigure from './ArchitectureFigure.jsx'
import { architecture } from '../content/architecture.js'

describe('ArchitectureFigure', () => {
  it('names the drawing and lists every step in words', () => {
    const { container } = render(<ArchitectureFigure />)
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      architecture.label,
    )
    expect(container.querySelectorAll('figcaption li')).toHaveLength(
      architecture.steps.length,
    )
  })

  it('draws one numbered edge for each step', () => {
    const { container } = render(<ArchitectureFigure />)
    expect(container.querySelectorAll('.arch__edge')).toHaveLength(
      architecture.steps.length,
    )
    expect(container.querySelectorAll('.arch__badge')).toHaveLength(
      architecture.steps.length,
    )
  })
})
