import '@testing-library/jest-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import TagPicker from './TagPicker.jsx'

afterEach(cleanup)

describe('TagPicker', () => {
  it('draws a labelled row of toggles per group of the type', () => {
    render(<TagPicker type="game" value={[]} onChange={() => {}} />)
    for (const label of ['Play style', 'Setting', 'Tone']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Shooter' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('offers a comic its own groups', () => {
    render(<TagPicker type="comic" value={[]} onChange={() => {}} />)
    const form = screen.getByRole('group', { name: 'Form' })
    expect(within(form).getAllByRole('button')).toHaveLength(5)
  })

  it('draws nothing for a type with no vocabulary', () => {
    const { container } = render(
      <TagPicker type="movie" value={[]} onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows what is chosen and sends the next list in vocabulary order', async () => {
    const onChange = vi.fn()
    render(
      <TagPicker
        type="game"
        value={[{ group: 'tone', tag: 'comedy' }]}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Comedy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'RPG' }))
    expect(onChange).toHaveBeenCalledWith([
      { group: 'play_style', tag: 'rpg' },
      { group: 'tone', tag: 'comedy' },
    ])
  })

  it('switches a tag off again', async () => {
    function Harness() {
      const [value, setValue] = useState([{ group: 'tone', tag: 'comedy' }])
      return <TagPicker type="game" value={value} onChange={setValue} />
    }
    render(<Harness />)
    const comedy = screen.getByRole('button', { name: 'Comedy' })
    await userEvent.click(comedy)
    expect(comedy).toHaveAttribute('aria-pressed', 'false')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <TagPicker type="game" value={[]} onChange={() => {}} />,
    )
    expect(await axeViolations(container)).toEqual([])
  })
})
