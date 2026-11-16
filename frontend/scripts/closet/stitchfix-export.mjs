/**
 * Stitch Fix order export, pure part: maps order data to closet seed rows and
 * CSV. Tested here; the same block is pasted into stitchfix-export.console.js
 * (a test keeps the two identical). See README.md.
 */

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

export {
  COLUMNS,
  categoryHint,
  csvField,
  dayOf,
  largeImage,
  rowsFromOrder,
  toCsv,
}
