import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { laneSpans, laneSpansFromRow, runModel } from '../lib/comicRun.js'
import RunLanes, { axisTicks, RunKey } from './RunLanes.jsx'

const lanesOf = () => screen.getByRole('img', { name: 'the facts' })
const runSpans = () => [
  ...lanesOf().querySelectorAll('.lane:first-child .lane-track i'),
]

describe('RunLanes', () => {
  it('is one named image with a block per issue for a short run', async () => {
    const { container } = render(
      <RunLanes
        spans={laneSpans(runModel({ singles: '1, 2, 4', released: 4 }))}
        label="the facts"
        mini
      />,
    )
    expect(runSpans().map((i) => i.dataset.k)).toEqual([
      'owned',
      'owned',
      'missing',
      'owned',
    ])
    expect(runSpans()[2].style.width).toBe('25%')
    expect(lanesOf().querySelector('[data-k="upcoming"]')).toBeNull()
    expect(await axeViolations(container)).toEqual([])
  })

  it('ends an ongoing run in a fixed tail, whatever its length', () => {
    render(
      <RunLanes
        spans={laneSpansFromRow({
          segments: [
            { kind: 'owned', length: 50 },
            { kind: 'upcoming', length: 30 },
          ],
          read_to: 25,
          ongoing: true,
        })}
        label="the facts"
        mini
      />,
    )
    expect(runSpans()).toHaveLength(1)
    expect(runSpans()[0].style.width).toBe('100%')
    expect(lanesOf().querySelector('.lane-tail [data-k="upcoming"]')).not.toBe(
      null,
    )
    const read = lanesOf().querySelector('[data-k="readbar"]')
    expect(read.style.width).toBe('50%')
  })

  it('names its lanes and draws an axis in the full form', () => {
    render(
      <RunLanes
        spans={laneSpans(runModel({ singles: '1–80', released: 100 }))}
        label="the facts"
      />,
    )
    expect(lanesOf()).toHaveTextContent('Run')
    expect(lanesOf()).toHaveTextContent('Read')
    expect(lanesOf().querySelector('[data-axis]')).not.toBeNull()
    expect(lanesOf()).not.toHaveTextContent('Skipped')
  })

  it('draws the Skipped lane only when asked', () => {
    const spans = laneSpans(
      runModel({ singles: '1–10, 14–30', skipped: '11–13', released: 30 }),
    )
    const { rerender } = render(<RunLanes spans={spans} label="the facts" />)
    expect(lanesOf()).not.toHaveTextContent('Skipped')
    rerender(<RunLanes spans={spans} label="the facts" showSkipped />)
    expect(lanesOf()).toHaveTextContent('Skipped private')
    // Dashed in the Run lane and on its own lane.
    expect(lanesOf().querySelectorAll('[data-k="skip"]')).toHaveLength(2)
  })

  it('draws nothing for an empty run', () => {
    const { container } = render(
      <RunLanes
        spans={laneSpansFromRow({ segments: [], ongoing: false })}
        label="none"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('spaces axis ticks by the run’s length', () => {
    expect(axisTicks(72)).toEqual([1, 25, 50, 72])
    expect(axisTicks(362)).toEqual([1, 50, 100, 150, 200, 250, 300, 362])
  })
})

describe('RunKey', () => {
  it('names the lane marks', async () => {
    const { container } = render(<RunKey />)
    const key = screen.getByRole('list', { name: 'Key' })
    expect(key).toHaveTextContent('OwnedMissingNot out yetRead')
    expect(await axeViolations(container)).toEqual([])
  })

  it('draws the Missing swatch as an element the stylesheet can outline', () => {
    render(<RunKey />)
    const swatch = screen
      .getByRole('list', { name: 'Key' })
      .querySelector('i[data-k="missing"]')
    expect(swatch).not.toBeNull()
    // Outside .lanes: the swatch must not lean on --lane-ground.
    expect(swatch.closest('.lanes')).toBeNull()
  })

  it('names the box marks, with skipped in admin', () => {
    render(<RunKey variant="box" showSkipped />)
    const key = screen.getByRole('list', { name: 'Key' })
    expect(key).toHaveTextContent('Skipped (private)')
    expect(key).toHaveTextContent('Collected edition')
  })
})
