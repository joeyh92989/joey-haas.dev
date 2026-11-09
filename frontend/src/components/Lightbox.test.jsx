import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { axeViolations } from '../lib/axe.test-util.js'
import Lightbox from './Lightbox.jsx'

// jsdom has no showModal or modal close; these do what the tests need of
// them, as the Wrap up sheet's tests do. Escape is a `cancel` event, which
// is what the browser sends.
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

const PHOTOS = ['walls', 'lokrum', 'portara'].map((name) => ({
  name,
  alt: `${name} alt`,
  caption: name === 'walls' ? 'On the wall' : null,
  width: 1600,
  height: 1067,
  day: 'Day 2 · The walls',
}))

/** A page with one opener per photo, holding the lightbox's state. */
function Page({ photos = PHOTOS }) {
  const [index, setIndex] = useState(null)
  const [opener, setOpener] = useState(null)
  return (
    <>
      {photos.map((photo, i) => (
        <button
          key={photo.name}
          type="button"
          onClick={(event) => {
            setOpener(event.currentTarget)
            setIndex(i)
          }}
        >
          Open {photo.name}
        </button>
      ))}
      <Lightbox
        slug="croatia-greece-2026"
        photos={photos}
        index={index}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
        opener={opener}
      />
    </>
  )
}

const dialog = () => document.querySelector('dialog')
const shown = () => within(dialog()).getByRole('img')

describe('Lightbox', () => {
  it('opens on the photo pressed, with focus inside', async () => {
    const user = userEvent.setup()
    render(<Page />)
    expect(dialog()).not.toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Open lokrum' }))
    expect(dialog()).toHaveAttribute('open')
    expect(shown()).toHaveAccessibleName('lokrum alt')
    expect(shown()).toHaveAttribute(
      'src',
      '/travel/croatia-greece-2026/lokrum-1600.webp',
    )
    expect(dialog()).toHaveTextContent('Day 2 · The walls · 2 of 3')
    expect(
      within(dialog()).getByRole('button', { name: 'Next photo, 3 of 3' }),
    ).toHaveFocus()
  })

  it('announces each step through its caption', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Open walls' }))
    const caption = dialog().querySelector('figcaption')
    expect(caption).toHaveAttribute('aria-live', 'polite')
    await user.keyboard('{ArrowRight}')
    expect(caption).toHaveTextContent('lokrum alt')
  })

  it('closes on a backdrop press only when the press began there', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Open walls' }))
    // A drag from the image that ends on the backdrop is not a dismissal.
    await user.pointer([
      { keys: '[MouseLeft>]', target: shown() },
      { target: dialog() },
      { keys: '[/MouseLeft]', target: dialog() },
    ])
    expect(dialog()).toHaveAttribute('open')
    await user.click(dialog())
    expect(dialog()).not.toHaveAttribute('open')
  })

  it('names the buttons by where they go, and wraps at both ends', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Open portara' }))
    const next = within(dialog()).getByRole('button', {
      name: 'Next photo, 1 of 3',
    })
    expect(
      within(dialog()).getByRole('button', { name: 'Previous photo, 2 of 3' }),
    ).toBeInTheDocument()
    await user.click(next)
    expect(shown()).toHaveAccessibleName('walls alt')
    expect(dialog()).toHaveTextContent('On the wall')
    expect(dialog()).toHaveTextContent('1 of 3')
  })

  it('moves with the arrow keys, wrapping', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Open walls' }))
    await user.keyboard('{ArrowLeft}')
    expect(shown()).toHaveAccessibleName('portara alt')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(shown()).toHaveAccessibleName('lokrum alt')
  })

  it('closes on Escape and gives focus back to the opener', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Open lokrum' })
    await user.click(opener)
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }))
    await screen.findByRole('button', { name: 'Open lokrum' })
    expect(dialog()).not.toHaveAttribute('open')
    expect(opener).toHaveFocus()
  })

  it('closes from its close button', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Open walls' })
    await user.click(opener)
    await user.click(
      within(dialog()).getByRole('button', { name: 'Close photos' }),
    )
    expect(dialog()).not.toHaveAttribute('open')
    expect(opener).toHaveFocus()
  })

  it('has no step buttons for a single photo', async () => {
    const user = userEvent.setup()
    render(<Page photos={PHOTOS.slice(0, 1)} />)
    await user.click(screen.getByRole('button', { name: 'Open walls' }))
    expect(within(dialog()).getAllByRole('button')).toHaveLength(1)
    expect(dialog()).toHaveTextContent('1 of 1')
  })

  it('has no axe violations while open', async () => {
    const user = userEvent.setup()
    const { container } = render(<Page />)
    await user.click(screen.getByRole('button', { name: 'Open walls' }))
    expect(await axeViolations(container)).toEqual([])
  })
})
