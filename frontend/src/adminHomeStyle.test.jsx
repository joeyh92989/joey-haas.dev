import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPageHeader from './components/AdminPageHeader.jsx'
import AreaCard, { AreaLead } from './components/AreaCard.jsx'
import JobStatusRow from './components/JobStatusRow.jsx'
import Panel from './components/Panel.jsx'
import SwapSheet from './components/SwapSheet.jsx'
import * as home from './components/adminHomeClasses.js'
import { readCss } from './testing/readCss.js'

// Admin Home, Jobs and the page header (#535) are drawn from utilities on
// the Button and Card looks. The hook classes stay; the legacy sheet's rules
// for these pieces are gone, since nothing else reads them.

// Read from disk: Vitest stubs CSS imports.
const css = readCss()

const GONE = [
  '.admin-head',
  '.admin-head h1',
  '.admin-head-desc',
  '.admin-head-end,\n.admin-head-status',
  '.panel',
  '.panel-head',
  '.panel-head h2',
  '.panel-head a',
  '.panel-body',
  '.job-list',
  '.job-row',
  '.job-when',
  '.job-text',
  '.job-label',
  '.job-summary',
  '.job-run',
  '.job-actions',
  '.job-run-button',
  '.job-result',
  '.recent-table tr:last-child td',
  '.area-card',
  '.area-card-head',
  '.area-card-title',
  '.area-card-figures',
  '.area-card-actions',
  '.swap-list',
  '.swap-choice',
  '.swap-choice-text',
]

describe('legacy rules these pages alone read', () => {
  it.each(GONE)('index.css no longer has a rule for %s', (selector) => {
    expect(css).not.toContain(`\n${selector} {`)
  })
})

describe('the strings', () => {
  it('give every control a 44px phone target', () => {
    for (const name of [
      'LINK',
      'PRIMARY',
      'PLAIN',
      'LINK_BUTTON',
      'SWAP_CANCEL',
      'TEXT_LINK',
    ]) {
      expect(home[name], name).toContain('max-[700px]:min-h-11')
    }
    expect(home.SWAP_CHOICE).toContain('min-h-11')
  })

  it('draws the design ring on panel and table links', () => {
    expect(home.PANEL_ACTION).toContain('[&_a]:focus-visible:outline-solid')
    expect(home.TEXT_LINK).toContain('focus-visible:outline-solid')
  })

  it('marks a disabled button by more than colour', () => {
    expect(home.PRIMARY).toContain('disabled:border-dashed')
    expect(home.PRIMARY).toContain('disabled:cursor-not-allowed')
    expect(home.LINK_BUTTON).toContain('disabled:aria-busy:cursor-progress!')
  })

  it('shows a disabled button in the page colours, not dimmed', () => {
    for (const name of ['PRIMARY', 'PLAIN', 'LINK_BUTTON']) {
      expect(home[name], name).toContain('disabled:opacity-100!')
      expect(home[name], name).toContain('disabled:text-muted-foreground!')
    }
  })
})

describe('AdminPageHeader', () => {
  it('keeps its hooks and draws the title as the serif', () => {
    const { container } = render(
      <AdminPageHeader title="Jobs" description="Every night">
        <span>end</span>
      </AdminPageHeader>,
    )
    expect(container.querySelector('header')).toHaveClass(
      'admin-head',
      'border-b',
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'font-heading',
    )
    expect(container.querySelector('.admin-head-desc')).toHaveClass(
      'text-muted-foreground',
    )
    expect(container.querySelector('.admin-head-end')).toHaveClass('ml-auto')
  })
})

describe('Panel and AreaCard', () => {
  it('draw the Card surface', () => {
    render(
      <MemoryRouter>
        <Panel title="Nightly jobs" action={<a href="/x">Go</a>}>
          <p>Body</p>
        </Panel>
        <AreaCard
          title="Closet"
          to="/admin/closet"
          linkLabel="Today"
          lead={<AreaLead title="Navy" meta="Office" />}
          figures={[{ label: 'To review', value: 3 }]}
        />
      </MemoryRouter>,
    )
    for (const region of [
      screen.getByRole('region', { name: 'Nightly jobs' }),
      screen.getByRole('region', { name: 'Closet' }),
    ]) {
      expect(region).toHaveClass('rounded-md', 'border-border', 'bg-card')
    }
    expect(screen.getByRole('link', { name: /^Today/ })).toHaveClass(
      'max-[700px]:min-h-11',
    )
  })
})

describe('JobStatusRow', () => {
  it('draws Run now as a link-look button with a phone target', () => {
    render(
      <MemoryRouter>
        <ul>
          <JobStatusRow
            job={{
              key: 'weather',
              label: 'Weekend forecast',
              at: Date.now(),
              summary: 'ok',
              state: 'ok',
              runNow: '/admin/weekend',
            }}
            run={{ path: '/api/spots/weather/refresh' }}
          />
        </ul>
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: /Run now/ })
    expect(button).toHaveClass('max-[700px]:min-h-11', 'text-accent-text')
    expect(button.className).not.toMatch(/\bjob-run-button\b.*\bbtn\b/)
    expect(screen.getByRole('link', { name: /Open/ })).toHaveClass(
      'max-[700px]:min-h-11',
    )
  })
})

describe('SwapSheet', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              slot: 'top',
              id: 'x',
              name: 'Grey tee',
              primary_hex: '#888888',
              qualifier: 'worn 2×',
            },
          ],
        }),
      })),
    )
  })
  afterEach(() => {
    delete HTMLDialogElement.prototype.showModal
    delete HTMLDialogElement.prototype.close
    vi.unstubAllGlobals()
  })

  it('has no legacy chip or button, and every control reaches 44px on a phone', async () => {
    const outfit = {
      garments: [
        { slot: 'top', id: 't', name: 'Oxford', primary_hex: '#223344' },
        { slot: 'shoes', id: 's', name: 'Sneakers', primary_hex: '#eeeeee' },
      ],
    }
    render(
      <SwapSheet
        open
        outfit={outfit}
        occasion="office"
        bike={false}
        onClose={() => {}}
        onChoose={() => {}}
      />,
    )
    const dialog = await screen.findByRole('dialog', { hidden: true })
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: /Grey tee/ }),
      ).toBeInTheDocument(),
    )
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button, button.textContent).not.toHaveClass('chip', 'btn')
      expect(button.className, button.textContent).toMatch(/min-h-11/)
    }
    // The chosen slot is pressed by more than colour: a heavier word.
    const top = within(dialog).getByRole('button', { name: 'Top' })
    expect(top).toHaveAttribute('aria-pressed', 'true')
    expect(top.className).toContain('aria-pressed:font-medium')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Shoes' }))
    expect(
      within(dialog).getByRole('button', { name: 'Shoes' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
