import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  categoryHint,
  csvField,
  largeImage,
  rowsFromOrder,
  toCsv,
} from './stitchfix-export.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const sku = (id, over = {}) => ({
  id,
  brand: 'Maple Row',
  name: 'Linen Shirt',
  color: 'Sky',
  sku_size: 'M',
  department: 'Upper Body Wear/Tops',
  flat_image_url:
    'https://img.example.test/image/upload/w_300,e_replace_color:f2f3f4:300:ffffff/v1/abc' +
    id,
  price_with_currency: { value: 4800 },
  ...over,
})

// Synthetic: invented names, ids, address and card.
const props = (over = {}) => ({
  clientOrder: {
    date_checked_out: '2026-03-05T14:22:00Z',
    shipping_address: {
      street: '12 Nowhere Lane',
      city: 'Faketown',
      zip: '00000',
    },
    payment: { card_last_four: '4242', name: 'Pat Example' },
    order: {
      deliveries: [
        {
          skus: [sku(101), sku(102, { department: 'Lower Body Wear/Bottoms' })],
        },
        { skus: [sku(103, { department: 'General Purpose Footwear' })] },
      ],
      returns: [{ skus: [{ id: 102 }] }],
    },
    ...over,
  },
})

describe('rowsFromOrder', () => {
  it('maps kept pieces and leaves returned ones out', () => {
    const rows = rowsFromOrder('9001', props())
    expect(rows.map((r) => r.store_item_no)).toEqual(['101', '103'])
    expect(rows[0]).toMatchObject({
      source: 'stitchfix',
      order_id: '9001',
      date: '2026-03-05',
      date_basis: 'checkout',
      brand: 'Maple Row',
      name: 'Linen Shirt',
      color_name: 'Sky',
      size: 'M',
      price_usd: '48',
      category_hint: 'top',
      still_owned: 'yes',
    })
    expect(rows[1].category_hint).toBe('shoes')
  })

  it('rewrites the image to 800px', () => {
    expect(rowsFromOrder('1', props())[0].image_url).toContain(
      '/w_800,e_replace',
    )
  })

  it('skips a box with no checkout date', () => {
    expect(rowsFromOrder('1', props({ date_checked_out: '' }))).toEqual([])
  })

  it('filters by since, exclusive', () => {
    expect(rowsFromOrder('1', props(), '2026-03-05')).toEqual([])
    expect(rowsFromOrder('1', props(), '2026-03-04')).toHaveLength(2)
  })

  it('leaves price empty when null', () => {
    const p = props()
    p.clientOrder.order.deliveries[0].skus[0].price_with_currency = {
      value: null,
    }
    expect(rowsFromOrder('1', p)[0].price_usd).toBe('')
  })

  it('tolerates missing structure', () => {
    expect(rowsFromOrder('1', {})).toEqual([])
    expect(rowsFromOrder('1', null)).toEqual([])
  })

  it('never carries address or card data into the output', () => {
    const out =
      JSON.stringify(rowsFromOrder('9001', props())) +
      toCsv(rowsFromOrder('9001', props()))
    for (const secret of [
      'Nowhere',
      'Faketown',
      '00000',
      '4242',
      'Pat Example',
      'shipping',
      'card',
    ]) {
      expect(out).not.toContain(secret)
    }
  })
})

describe('categoryHint', () => {
  it('maps the known departments, others to accessory, none to empty', () => {
    expect(categoryHint('Upper Body Wear/Tops')).toBe('top')
    expect(categoryHint('Lower Body Wear/Bottoms')).toBe('bottom')
    expect(categoryHint('General Purpose Footwear')).toBe('shoes')
    expect(categoryHint('Jewelry')).toBe('accessory')
    expect(categoryHint(undefined)).toBe('')
  })
})

describe('largeImage', () => {
  it('handles a missing url', () => {
    expect(largeImage(undefined)).toBe('')
  })
})

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('Cotton Slub Short - 8"')).toBe('"Cotton Slub Short - 8"""')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('a\nb')).toBe('"a\nb"')
    expect(csvField('plain')).toBe('plain')
  })

  it('writes the exact header and a running number', () => {
    const csv = toCsv(rowsFromOrder('9001', props()))
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(
      'n,source,order_id,date,date_basis,brand,name,color_name,size,price_usd,category_hint,store_item_no,still_owned,image_url',
    )
    expect(COLUMNS.join(',')).toBe(lines[0])
    expect(lines[1].startsWith('1,stitchfix,9001,2026-03-05,checkout,')).toBe(
      true,
    )
    expect(lines[2].startsWith('2,')).toBe(true)
  })
})

describe('console script', () => {
  it('embeds the same logic as the module', () => {
    const block = (file) =>
      readFileSync(join(here, file), 'utf8')
        .split('// ---- BEGIN SHARED')[1]
        .split('// ---- END SHARED')[0]
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .join('\n')
    expect(block('./stitchfix-export.console.js')).toBe(
      block('./stitchfix-export.mjs'),
    )
  })

  it('makes no request but same-origin GETs and sends nothing out', () => {
    const src = readFileSync(
      join(here, './stitchfix-export.console.js'),
      'utf8',
    )
    expect(src).not.toMatch(/https?:\/\/(?!www\.stitchfix\.com\/orders)/)
    expect(src).not.toMatch(
      /sendBeacon|XMLHttpRequest|WebSocket|method:\s*['"]POST/i,
    )
  })
})
