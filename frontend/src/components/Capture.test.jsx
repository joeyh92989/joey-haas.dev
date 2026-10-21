import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarRow from './BarRow.jsx'
import Capture, { CaptureFacts, CaptureTable } from './Capture.jsx'
import LiveBox from './LiveBox.jsx'

describe('Capture', () => {
  it('hides the browser chrome and keeps the note as the caption', () => {
    const { container } = render(
      <Capture url="/admin/radar" tag="signed in" note="Drawn, illustrative.">
        <p>body</p>
      </Capture>,
    )
    const bar = container.querySelector('.tour-capture-bar')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toHaveTextContent('/admin/radar')
    expect(container.querySelector('figure > figcaption')).toHaveTextContent(
      'Drawn, illustrative.',
    )
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('draws a real table with column headers, pills and redactions', () => {
    render(
      <CaptureTable
        columns={['Game', 'Store', 'Format']}
        rows={[
          [
            'Game A',
            { redacted: 'cartridge (US)' },
            { pill: 'cartridge', tone: 'ok' },
          ],
        ]}
      />,
    )
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    const cells = within(table).getAllByRole('cell')
    expect(cells[1]).toHaveTextContent('store withheld cartridge (US)')
    expect(within(cells[2]).getByText('cartridge')).toHaveClass(
      'tour-pill',
      'tour-pill-ok',
    )
  })

  it('lists facts as terms and values', () => {
    render(<CaptureFacts facts={[['Stores', '12 watched']]} />)
    expect(screen.getByRole('term')).toHaveTextContent('Stores')
    expect(screen.getByRole('definition')).toHaveTextContent('12 watched')
  })
})

describe('BarRow', () => {
  it('shows the number and hides the drawn bar', () => {
    const { container } = render(<BarRow label="Affinity" value={82} />)
    expect(screen.getByText('82')).toBeInTheDocument()
    const bar = container.querySelector('.tour-bar')
    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar.firstChild).toHaveStyle({ width: '82%' })
  })
})

describe('LiveBox', () => {
  it('renders its content and caption', () => {
    render(
      <LiveBox caption="The newest games.">
        <p>covers</p>
      </LiveBox>,
    )
    expect(screen.getByText('covers')).toBeInTheDocument()
    expect(screen.getByText('The newest games.')).toBeInTheDocument()
  })
})
