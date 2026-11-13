import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Sheet from './Sheet.jsx'

// jsdom has no showModal or modal close; these do what the tests need of
// them. Escape is a `cancel` event, which is what the browser sends.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
})

/** An opener button and a sheet it toggles. */
function Page({ canClose, sheetProps = {}, children }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="t"
        canClose={canClose}
        {...sheetProps}
      >
        {children ?? (
          <>
            <h2 id="t">Title</h2>
            <button type="button" data-autofocus>
              Inside
            </button>
          </>
        )}
      </Sheet>
    </>
  )
}

const dialog = () => document.querySelector('dialog')

describe('Sheet', () => {
  it('opens as a modal and mounts its children only while open', async () => {
    render(<Page />)
    expect(dialog()).not.toHaveAttribute('open')
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(dialog()).toHaveAttribute('open')
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  it('closes on Escape (the cancel event)', async () => {
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(dialog()).not.toHaveAttribute('open')
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
  })

  it('closes on a press that begins and ends on the backdrop', async () => {
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(dialog())
    expect(dialog()).not.toHaveAttribute('open')
  })

  it('stays open for a click on its contents, or one not begun on the backdrop', async () => {
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByText('Title'))
    expect(dialog()).toHaveAttribute('open')
    // A drag that began inside and ended on the backdrop.
    fireEvent.pointerDown(screen.getByText('Title'))
    fireEvent.click(dialog())
    expect(dialog()).toHaveAttribute('open')
  })

  it('brings the owner back in step when the dialog closes natively', async () => {
    render(<Page />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    act(() => dialog().close())
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(dialog()).toHaveAttribute('open')
  })

  it('moves focus to [data-autofocus] and back to the opener', async () => {
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(opener).toHaveFocus()
  })

  it('takes initialFocus as a selector', async () => {
    render(
      <Page sheetProps={{ initialFocus: '.second' }}>
        <h2 id="t">Title</h2>
        <button type="button" data-autofocus>
          First
        </button>
        <button type="button" className="second">
          Second
        </button>
      </Page>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus()
  })

  it('takes initialFocus as a ref', async () => {
    function WithRef() {
      const target = useRef(null)
      return (
        <Page sheetProps={{ initialFocus: target }}>
          <h2 id="t">Title</h2>
          <button type="button" data-autofocus>
            First
          </button>
          <button type="button" ref={target}>
            Second
          </button>
        </Page>
      )
    }
    render(<WithRef />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus()
  })

  it('returns focus to returnFocus when given one', async () => {
    function WithReturn() {
      const other = useRef(null)
      return (
        <>
          <button type="button" ref={other}>
            Elsewhere
          </button>
          <Page sheetProps={{ returnFocus: other }} />
        </>
      )
    }
    render(<WithReturn />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
  })

  it('falls back to the opener when the returnFocus target is detached or missing', async () => {
    const detached = document.createElement('button')
    const { unmount } = render(<Page sheetProps={{ returnFocus: detached }} />)
    let opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(opener).toHaveFocus()
    unmount()
    render(<Page sheetProps={{ returnFocus: { current: null } }} />)
    opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(opener).toHaveFocus()
  })

  it('is named by its heading (labelledBy) or by ariaLabel', async () => {
    const { unmount } = render(<Page />)
    expect(dialog()).toHaveAttribute('aria-labelledby', 't')
    expect(dialog()).not.toHaveAttribute('aria-label')
    unmount()
    render(
      <Page sheetProps={{ labelledBy: undefined, ariaLabel: 'Photos' }}>
        <p>No heading</p>
      </Page>,
    )
    expect(dialog()).toHaveAttribute('aria-label', 'Photos')
    expect(dialog()).not.toHaveAttribute('aria-labelledby')
  })

  it('wears .sheet by default and only its className when bare', () => {
    const { unmount } = render(<Page sheetProps={{ className: 'extra' }} />)
    expect(dialog()).toHaveClass('sheet', 'extra')
    unmount()
    render(<Page sheetProps={{ variant: 'bare', className: 'extra' }} />)
    expect(dialog()).toHaveClass('extra')
    expect(dialog()).not.toHaveClass('sheet')
  })

  it('stays open when canClose refuses, for Escape, backdrop and native close', async () => {
    render(<Page canClose={() => false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog(), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    await userEvent.click(dialog())
    dialog().close()
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  it('closes when canClose allows it', async () => {
    render(<Page canClose={() => true} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(dialog()).not.toHaveAttribute('open')
  })
})
