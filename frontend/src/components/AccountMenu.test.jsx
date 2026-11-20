import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import AccountMenu from './AccountMenu.jsx'

function setup(props = {}) {
  const onSignOut = props.onSignOut ?? vi.fn()
  const view = render(
    <MemoryRouter>
      <p>
        <a href="#elsewhere">elsewhere</a>
      </p>
      <AccountMenu
        email="admin@example.com"
        variant="rail"
        onSignOut={onSignOut}
        {...props}
      />
      <a href="#after">after</a>
    </MemoryRouter>,
  )
  return { onSignOut, ...view }
}

const button = () => screen.getByRole('button', { name: /^Account/ })

describe('AccountMenu', () => {
  it('is a real button named for the account, closed to begin with', () => {
    setup()
    expect(button()).toHaveAccessibleName('Account, admin@example.com')
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(button()).toHaveAttribute('aria-controls')
    const panel = document.getElementById(
      button().getAttribute('aria-controls'),
    )
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveAttribute('hidden')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('is named the same in the phone pill', () => {
    setup({ variant: 'pill' })
    expect(button()).toHaveAccessibleName('Account, admin@example.com')
  })

  it('opens on a press to show the email, View site and Sign out', async () => {
    setup()
    await userEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Signed in as')).toBeVisible()
    expect(screen.getByText('admin@example.com')).toBeVisible()
    expect(screen.getByRole('link', { name: /view site/i })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('closes on a second press of the button', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape and gives focus back to the button', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.tab()
    expect(screen.getByRole('link', { name: /view site/i })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(button()).toHaveFocus()
  })

  it('closes on a press outside', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.click(screen.getByText('elsewhere'))
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays open on a press inside the panel', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.click(screen.getByText('Signed in as'))
    expect(button()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes when Tab leaves the panel', async () => {
    setup()
    await userEvent.click(button())
    await userEvent.tab() // View site
    await userEvent.tab() // Sign out
    await userEvent.tab() // out of the menu
    expect(screen.getByText('after')).toHaveFocus()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
  })

  it('signs out on one press, with no confirm step', async () => {
    const { onSignOut } = setup()
    await userEvent.click(button())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('says Signing out… in place and ignores a second press', async () => {
    const { onSignOut } = setup({ pending: true })
    await userEvent.click(button())
    const signing = screen.getByRole('button', { name: 'Signing out…' })
    expect(signing).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(signing)
    expect(onSignOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('shows a failed sign-out as an alert inside the open panel', async () => {
    setup({ failed: true })
    await userEvent.click(button())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t sign out. Try again in a minute.',
    )
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  it('draws no alert when sign-out has not failed', async () => {
    setup()
    await userEvent.click(button())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
