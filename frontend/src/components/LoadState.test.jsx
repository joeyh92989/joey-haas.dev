import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOAD_ERROR,
  REFRESH_FAILED,
  SESSION_ENDED,
  STALE_COPY,
  TRY_AGAIN,
  WAKING,
} from '../content/status.js'
import LoadState from './LoadState.jsx'

afterEach(() => vi.useRealTimers())

describe('LoadState', () => {
  it('says Loading… while waiting, then WAKING after the threshold', () => {
    vi.useFakeTimers()
    render(<LoadState loading />)
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole('status').textContent).toBe(WAKING)
  })

  it('shows the failure and a working Try again when there is no data', async () => {
    const onRetry = vi.fn()
    render(<LoadState failed onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain(LOAD_ERROR)
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the quiet stale line with Try again when data is showing', async () => {
    const onRetry = vi.fn()
    render(<LoadState failed stale onRetry={onRetry} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(STALE_COPY)
    await userEvent.click(screen.getByRole('button', { name: TRY_AGAIN }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('failure wins over loading', () => {
    render(<LoadState loading failed />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('renders nothing once there is data', () => {
    const { container } = render(<LoadState />)
    expect(container.innerHTML).toBe('')
  })

  it("shows the page's own message instead of LOAD_ERROR, and no button without onRetry", () => {
    render(<LoadState failed message="The analytics couldn’t be read." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('The analytics couldn’t be read.')
    expect(alert.textContent).not.toContain(LOAD_ERROR)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the stale line when a message is given and data is showing', () => {
    render(<LoadState failed stale message="Custom" />)
    expect(screen.getByRole('status').textContent).toContain(STALE_COPY)
  })

  it('says the refresh failed once live data was on screen', () => {
    render(<LoadState failed stale live onRetry={vi.fn()} />)
    const line = screen.getByRole('status').textContent
    expect(line).toContain(REFRESH_FAILED)
    expect(line).not.toContain(STALE_COPY)
  })

  it('lets a page word the stale line itself', () => {
    render(<LoadState failed stale live staleMessage="Saved, not shown." />)
    expect(screen.getByRole('status').textContent).toContain(
      'Saved, not shown.',
    )
  })

  it('says the session ended, with no Try again, when told so', () => {
    render(<LoadState ended failed onRetry={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe(SESSION_ENDED)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
