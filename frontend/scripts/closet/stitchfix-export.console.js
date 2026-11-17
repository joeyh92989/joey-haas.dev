/*
 * Stitch Fix order export. Paste into the browser console on
 * https://www.stitchfix.com/orders while signed in, then press Enter.
 * Sends nothing anywhere: it only GETs stitchfix.com pages on this origin and
 * saves a CSV to Downloads. See README.md.
 */
/* global document, DOMParser, Blob, URL, fetch, console, setTimeout */
;(async () => {
  const SINCE = '' // 'YYYY-MM-DD': only orders checked out after this day
  const MAX_PAGES = 20
  const DELAY_MS = 600

  // ---- BEGIN SHARED (identical in stitchfix-export.mjs and stitchfix-export.console.js) ----
  const COLUMNS = [
    'n',
    'source',
    'order_id',
    'date',
    'date_basis',
    'brand',
    'name',
    'color_name',
    'size',
    'price_usd',
    'category_hint',
    'store_item_no',
    'still_owned',
    'image_url',
  ]

  const CATEGORY_BY_DEPARTMENT = {
    'Upper Body Wear/Tops': 'top',
    'Lower Body Wear/Bottoms': 'bottom',
    'General Purpose Footwear': 'shoes',
  }

  function categoryHint(department) {
    if (!department) return ''
    return CATEGORY_BY_DEPARTMENT[department] || 'accessory'
  }

  // Stitch Fix serves a 300px thumbnail with a background-colour swap; ask for 800px.
  function largeImage(url) {
    return typeof url === 'string' ? url.replace('w_300', 'w_800') : ''
  }

  // A checkout date as YYYY-MM-DD, or '' when absent or unreadable.
  function dayOf(value) {
    if (typeof value !== 'string' || !value) return ''
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
    const t = Date.parse(value)
    return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10)
  }

  function dollars(cents) {
    return typeof cents === 'number' ? String(cents / 100) : ''
  }

  // Reads ONLY the named line-item fields plus the order id and checkout date.
  // The props object also carries a shipping address and card digits; nothing
  // else is touched, copied or returned. Returned pieces are left out, and so
  // is a box with no checkout date (still undecided).
  function rowsFromOrder(orderId, props, since) {
    const order = props && props.clientOrder && props.clientOrder.order
    const date = dayOf(
      props && props.clientOrder && props.clientOrder.date_checked_out,
    )
    if (!order || !date) return []
    if (since && !(date > since)) return []
    const returned = new Set()
    for (const ret of order.returns || []) {
      for (const sku of ret.skus || []) returned.add(sku.id)
    }
    const rows = []
    for (const delivery of order.deliveries || []) {
      for (const sku of delivery.skus || []) {
        if (returned.has(sku.id)) continue
        rows.push({
          source: 'stitchfix',
          order_id: String(orderId),
          date,
          date_basis: 'checkout',
          brand: sku.brand || '',
          name: sku.name || '',
          color_name: sku.color || '',
          size: sku.sku_size || '',
          price_usd: dollars(
            sku.price_with_currency && sku.price_with_currency.value,
          ),
          category_hint: categoryHint(sku.department),
          store_item_no: sku.id == null ? '' : String(sku.id),
          still_owned: 'yes',
          image_url: largeImage(sku.flat_image_url),
        })
      }
    }
    return rows
  }

  function csvField(value) {
    const s = value == null ? '' : String(value)
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }

  function toCsv(rows) {
    const lines = [COLUMNS.join(',')]
    rows.forEach((row, i) => {
      lines.push(
        COLUMNS.map((c) => csvField(c === 'n' ? i + 1 : row[c])).join(','),
      )
    })
    return lines.join('\r\n') + '\r\n'
  }
  // ---- END SHARED ----

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const idsIn = (doc) =>
    [...doc.querySelectorAll('a[href^="/orders/"]')]
      .map((a) => (a.getAttribute('href').match(/^\/orders\/(\d+)/) || [])[1])
      .filter(Boolean)

  // The order links are drawn client-side, so load each list page in a hidden
  // same-origin iframe and wait for them to appear.
  async function idsOnPage(page) {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = '/orders?page=' + page
    document.body.appendChild(frame)
    try {
      await new Promise((r) =>
        frame.addEventListener('load', r, { once: true }),
      )
      for (let i = 0; i < 20; i++) {
        const ids = idsIn(frame.contentDocument)
        if (ids.length) return ids
        await sleep(500)
      }
      return []
    } finally {
      frame.remove()
    }
  }

  const ids = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const found = (await idsOnPage(page)).filter((id) => !ids.includes(id))
    if (!found.length) break
    ids.push(...new Set(found))
    console.log('orders page ' + page + ': ' + ids.length + ' orders so far')
    await sleep(DELAY_MS)
  }

  const rows = []
  for (const id of ids) {
    const res = await fetch('/orders/' + id, { credentials: 'include' })
    if (!res.ok) {
      console.warn('order ' + id + ': HTTP ' + res.status + ', skipped')
      continue
    }
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
    const el = doc.querySelector('div[data-react-class="OrderHistory"]')
    let props = null
    try {
      props = JSON.parse(el.getAttribute('data-react-props'))
    } catch {
      console.warn('order ' + id + ': no readable order data, skipped')
    }
    if (props) rows.push(...rowsFromOrder(id, props, SINCE))
    await sleep(DELAY_MS)
  }

  if (!rows.length) {
    console.warn(
      'No pieces found. Is the page signed in, and did the layout change? See README.md.',
    )
    return
  }
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'stitchfix-seed.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  console.log(
    'Saved stitchfix-seed.csv: ' +
      rows.length +
      ' pieces from ' +
      ids.length +
      ' orders.',
  )
})()
