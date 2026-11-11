import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import KindFields from './KindFields.jsx'

const COMIC = [
  {
    key: 'issues_owned',
    label: 'Issues owned',
    control: 'text',
    options: [],
    per_item: true,
    required: false,
  },
  {
    key: 'shelf_format',
    label: 'Shelf format',
    control: 'select',
    options: ['singles', 'trades', 'omnibus'],
    per_item: false,
    required: false,
  },
  {
    key: 'acquired_at',
    label: 'Acquired',
    control: 'date',
    options: [],
    per_item: false,
    required: false,
  },
]

function Harness({ fields, mode, refusals, onChange = () => {} }) {
  const [values, setValues] = useState({})
  return (
    <KindFields
      idPrefix="t"
      fields={fields}
      mode={mode}
      values={values}
      refusals={refusals}
      onChange={(key, value) => {
        setValues((old) => ({ ...old, [key]: value }))
        onChange(key, value)
      }}
    />
  )
}

describe('KindFields', () => {
  it('renders a kind it has never seen, from its field list alone', () => {
    // AC 9/10: a test kind with a field no shared component knows about.
    const fields = [
      {
        key: 'pressing',
        label: 'Pressing',
        control: 'select',
        options: ['first', 'reissue'],
        per_item: false,
        required: true,
      },
      {
        key: 'sleeve_note',
        label: 'Sleeve note',
        control: 'text',
        options: [],
        per_item: true,
        required: false,
      },
      {
        key: 'discs',
        label: 'Discs',
        control: 'number',
        options: [],
        per_item: false,
        required: false,
      },
    ]
    const onChange = vi.fn()
    render(<Harness fields={fields} onChange={onChange} />)
    const pressing = screen.getByLabelText('Pressing')
    expect(pressing.tagName).toBe('SELECT')
    expect(pressing).toBeRequired()
    expect([...pressing.options].map((o) => o.textContent)).toEqual([
      '—',
      'First',
      'Reissue',
    ])
    fireEvent.change(pressing, { target: { value: 'reissue' } })
    expect(onChange).toHaveBeenCalledWith('pressing', 'reissue')
    expect(screen.getByLabelText('Sleeve note')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Discs')).toHaveAttribute('type', 'number')
  })

  it('offers only shared fields in "set for all" mode', () => {
    render(<Harness fields={COMIC} mode="all" />)
    expect(screen.queryByLabelText('Issues owned')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Shelf format')).toBeInTheDocument()
    expect(screen.getByLabelText('Acquired')).toHaveAttribute('type', 'date')
  })

  it('offers only per-item fields in item mode', () => {
    render(<Harness fields={COMIC} mode="item" />)
    expect(screen.getByLabelText('Issues owned')).toBeInTheDocument()
    expect(screen.queryByLabelText('Shelf format')).not.toBeInTheDocument()
  })

  it('names known option values in words', () => {
    render(<Harness fields={COMIC} />)
    expect(
      [...screen.getByLabelText('Shelf format').options].map(
        (o) => o.textContent,
      ),
    ).toEqual(['—', 'Single issues', 'Trade paperbacks', 'Omnibus'])
  })

  it("shows the write path's refusal beside its field", () => {
    render(
      <Harness
        fields={COMIC}
        mode="item"
        refusals={{ issues_owned: 'Issue 0 is not a range' }}
      />,
    )
    const field = screen.getByLabelText('Issues owned')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Issue 0 is not a range')
  })
})
