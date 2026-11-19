import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import { entry, fakeIntakeApi, KINDS } from '../../lib/intake.test-util.js'
import LinkCheck from './LinkCheck.jsx'

const KIND = KINDS.find((kind) => kind.key === 'garment')

const SIZES = [
  { size: 'Small', variant_id: '1', available: true },
  { size: 'Medium', variant_id: '2', available: false },
]
const RED = {
  external_id: '11',
  title: 'Red',
  color_name: 'Red',
  image_url: 'https://cdn.test/red.jpg',
  price: '40.00',
  sizes: SIZES,
}
const BLUE = { ...RED, external_id: '13', title: 'Blue', color_name: 'Blue' }

const linkEntry = (id, payload = {}, extra = {}) =>
  entry(id, 'typed', {
    kind: 'garment',
    payload: {
      name: 'Test Crew',
      brand: 'Acme',
      color_name: 'Red',
      primary_color: 'red',
      image: 'held',
      link: {
        url: 'https://www.shop.test/products/t',
        state: 'resolved',
        via: 'shopify',
      },
      seed: { source: 'link', row: { chosen: '11' } },
      ...payload,
    },
    candidates: [RED, BLUE],
    photo_id: `p-${id}`,
    ...extra,
  })

function Harness({ initial }) {
  const [entries, setEntries] = useState(initial)
  const replace = (next) =>
    setEntries((old) => old.map((e) => (e.id === next.id ? next : e)))
  return (
    <LinkCheck
      sitting={{ id: 's1' }}
      kind={KIND}
      entries={entries.filter((e) => e.state !== 'ignored')}
      onEntry={replace}
    />
  )
}

function show(initial, options = {}) {
  const api = fakeIntakeApi({
    ...options,
    sittings: [{ id: 's1', area: 'closet', kind: 'garment', entries: initial }],
  })
  const view = render(<Harness initial={initial} />)
  return { api, ...view }
}

afterEach(() => vi.unstubAllGlobals())

describe('LinkCheck', () => {
  it('shows the store, the colors as a radio group and the sizes', async () => {
    const { container } = show([linkEntry('e1')])
    expect(
      await screen.findByText('shop.test · read from the store’s product data'),
    ).toBeVisible()
    expect(screen.getByRole('img', { name: 'Test Crew' })).toHaveAttribute(
      'src',
      '/api/intake/photos/p-e1/image',
    )
    const group = screen.getByRole('group', { name: 'Color' })
    expect(group).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Red' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Blue' })).not.toBeChecked()
    const size = screen.getByRole('combobox', { name: 'Size' })
    expect(size).toHaveValue('')
    expect(
      screen.getByRole('option', { name: 'Medium (sold out)' }),
    ).toBeVisible()
    expect(await axeViolations(container)).toEqual([])
  })

  it('asks for a color while none is chosen', async () => {
    show([
      linkEntry('e1', {
        color_name: undefined,
        primary_color: undefined,
        seed: { source: 'link', row: {} },
      }),
    ])
    expect(await screen.findByText(/^Needs a color choice/)).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Red' })).not.toBeChecked()
  })

  it('chooses a color through the server and shows what it answers', async () => {
    const user = userEvent.setup()
    const { api } = show([linkEntry('e1')], {
      choose: (found, body) => ({
        status: 200,
        body: {
          ...found,
          photo_id: null,
          payload: {
            ...found.payload,
            color_name: 'Blue',
            primary_color: 'blue',
            image: 'pending',
            seed: { source: 'link', row: { chosen: body.external_id } },
          },
        },
      }),
    })
    await user.click(await screen.findByRole('radio', { name: 'Blue' }))
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked(),
    )
    expect(api.calls('POST', /entries\/e1\/choose$/)[0].body).toEqual({
      external_id: '13',
    })
    expect(screen.getByLabelText('Store color')).toHaveValue('Blue')
  })

  it('saves the size when one is chosen', async () => {
    const user = userEvent.setup()
    const { api } = show([linkEntry('e1')])
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Size' }),
      'Small',
    )
    await waitFor(() =>
      expect(api.calls('PATCH', /entries\/e1$/)).toHaveLength(1),
    )
    expect(api.calls('PATCH', /entries\/e1$/)[0].body.payload.size).toBe(
      'Small',
    )
  })

  it('says why a link was kept as typed and offers a size to type', async () => {
    show([
      linkEntry(
        'e1',
        {
          color_name: undefined,
          link: {
            url: 'https://refuses.test/products/x',
            state: 'kept',
            message:
              'refuses.test asks programs not to read that page (robots.txt)',
          },
          image: 'none',
        },
        { candidates: [], photo_id: null },
      ),
    ])
    expect(
      await screen.findByText(/refuses.test asks programs not to read/),
    ).toBeVisible()
    expect(screen.getByText('Kept as typed.')).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Color' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Size' })).toBeVisible()
    expect(screen.getByText('The store gave no photo.')).toBeVisible()
  })

  it('removes a piece after asking, without deleting anything', async () => {
    const user = userEvent.setup()
    const { api } = show([linkEntry('e1'), linkEntry('e2')])
    await user.click(
      (await screen
        .findByRole('button', { name: 'Remove from this sitting: Test Crew' })
        .catch(() => null)) ??
        screen.getAllByRole('button', { name: /Remove from this sitting/ })[0],
    )
    await user.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
    expect(api.calls('PATCH', /entries\/e1$/)[0].body).toEqual({
      state: 'ignored',
    })
  })

  it('stops asking for photos the server cannot fetch and says so', async () => {
    const { api } = show(
      [linkEntry('e1', { image: 'pending' }, { photo_id: null })],
      {
        seedImages: () => ({ entries: [], pending: 1 }),
      },
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The photos could not be fetched',
    )
    expect(api.calls('POST', /seed-images$/)).toHaveLength(1)
  })

  it('sends only the keys that were edited, so a stale save cannot undo a choice', async () => {
    const user = userEvent.setup()
    const { api } = show([linkEntry('e1')])
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Crew')
    await user.tab()
    await waitFor(() =>
      expect(api.calls('PATCH', /entries\/e1$/)).toHaveLength(1),
    )
    expect(api.calls('PATCH', /entries\/e1$/)[0].body).toEqual({
      payload: { name: 'Crew' },
    })
  })

  it('saves a pending edit before the color is chosen, in that order', async () => {
    const user = userEvent.setup()
    const { api } = show([linkEntry('e1')])
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Crew')
    await user.click(screen.getByRole('radio', { name: 'Blue' }))
    await waitFor(() => expect(api.calls('POST', /choose$/)).toHaveLength(1))
    const order = api.fetch.mock.calls
      .map(([url, options]) => `${options?.method ?? 'GET'} ${url}`)
      .filter((call) => /entries\/e1/.test(call))
    expect(order).toEqual([
      'PATCH /api/intake/entries/e1',
      'POST /api/intake/entries/e1/choose',
    ])
  })

  it('keeps the fields still while a color is being chosen', async () => {
    const user = userEvent.setup()
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const { api } = show([linkEntry('e1')], {
      choose: async (found) => {
        await gate
        return { status: 200, body: found }
      },
    })
    await user.click(await screen.findByRole('radio', { name: 'Blue' }))
    expect(screen.getByLabelText('Name')).toBeDisabled()
    release()
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeEnabled())
    expect(api.calls('POST', /choose$/)).toHaveLength(1)
  })
})
