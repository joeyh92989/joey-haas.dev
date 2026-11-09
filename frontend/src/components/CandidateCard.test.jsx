import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CandidateCard from './CandidateCard.jsx'
import { runLine } from './SpotFinder.jsx'

const CANDIDATE = {
  id: 'k1',
  source: 'osm',
  source_id: 'node/1',
  name: 'Kaffe Landscap',
  category: 'cafe',
  distance: '0.6 mi from Union Station · on foot',
  fit: 82,
  reason: 'Near the station.',
  suggested_tags: ['coffee', 'rainy-day'],
}

function renderCard(props = {}) {
  const onAccept = vi.fn()
  const onDismiss = vi.fn()
  render(
    <ul>
      <CandidateCard
        candidate={CANDIDATE}
        busy={false}
        onAccept={onAccept}
        onDismiss={onDismiss}
        {...props}
      />
    </ul>,
  )
  return { onAccept, onDismiss }
}

describe('CandidateCard', () => {
  it('names the source in words, not colour alone', () => {
    renderCard()
    expect(screen.getByText('OSM')).toHaveAttribute(
      'title',
      'From OpenStreetMap',
    )
  })

  it('starts with the suggested tags pressed', () => {
    renderCard()
    expect(screen.getByRole('button', { name: 'Coffee' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Park' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('accepts with the pressed tags in vocabulary order', async () => {
    const { onAccept } = renderCard()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Coffee' }))
    await user.click(screen.getByRole('button', { name: 'Park' }))
    await user.click(
      screen.getByRole('button', { name: 'Accept into spots: Kaffe Landscap' }),
    )
    expect(onAccept).toHaveBeenCalledWith(CANDIDATE, ['park', 'rainy-day'])
  })

  it('dismisses', async () => {
    const { onDismiss } = renderCard()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Dismiss: Kaffe Landscap' }))
    expect(onDismiss).toHaveBeenCalledWith(CANDIDATE)
  })

  it('holds every control while an answer is in flight', () => {
    renderCard({ busy: true })
    for (const button of screen.getAllByRole('button'))
      expect(button).toBeDisabled()
  })

  it('says an unscored place was not scored', () => {
    renderCard({ candidate: { ...CANDIDATE, fit: null } })
    expect(
      screen.getByText('Not scored: the model didn’t answer this run.'),
    ).toBeInTheDocument()
  })
})

describe('runLine', () => {
  const at = '2026-11-08T23:00:00Z'
  const now = Date.parse(at)
  const ok = { at, state: 'ok', found: 5, new: 2, ranked_by: 'model' }

  it('is unknown before the first run', () => {
    expect(runLine(null).state).toBe('unknown')
  })

  it('goes stale after a missed Sunday', () => {
    expect(runLine(ok, now).state).toBe('ok')
    expect(runLine(ok, now + 9 * 86_400_000).state).toBe('stale')
  })

  it('says when the model did not rank the run', () => {
    expect(runLine({ ...ok, ranked_by: 'fallback' }, now).words).toMatch(
      /Not scored/,
    )
  })

  it('points a run with no anchors at the fix', () => {
    const line = runLine({ at, state: 'no_anchors' }, now)
    expect(line.state).toBe('failed')
    expect(line.words).toMatch(/Mark a spot as an anchor/)
  })
})
