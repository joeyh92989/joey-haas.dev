// Diffs two style-dump.mjs outputs:
//   node e2e/tools/style-diff.mjs a.json b.json [b.json.meta.json]
// The optional third file is the second dump's META=1 sidecar (tag, class and
// input type per element); the checkbox rule below needs it.
import { readFileSync, existsSync } from 'node:fs'
import { IDX } from './props.mjs'

const [aFile, bFile, metaFile] = process.argv.slice(2)
const [a, b] = [aFile, bFile].map((f) => JSON.parse(readFileSync(f, 'utf8')))
const meta =
  metaFile && existsSync(metaFile)
    ? JSON.parse(readFileSync(metaFile, 'utf8'))
    : {}

// The jobs table's rows are listed in a different order on each load of the
// mocked /admin/jobs (a timing tie in the page's own sort), which moves the
// widths of the links in them between runs of the same build. Those widths are
// not compared.
const jobsRow = (label, key) =>
  label.endsWith('/admin/jobs') && key.includes('>tbody[')

// A border with no width is not drawn whatever its style or colour:
// Preflight's `border: 0 solid` and the browser's own button, fieldset or
// input border are the same on screen, and a width that changes still shows up
// as its own difference. Compared as equal.
const SIDES = ['top', 'right', 'bottom', 'left']

// What a slice H (#536: Preflight really on) change may differ in without
// anything being drawn differently. Each rule below is one line of the
// "Explained differences" list in README.md.
const INLINE = new Set([
  'inline',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'inline-table',
  'table-cell',
  'ruby',
])
// A checkbox, radio or range has no text and draws its own colours: Preflight's
// `font: inherit; color: inherit` on a control changes nothing about it.
const NO_TEXT = new Set(['checkbox', 'radio', 'range', 'hidden', 'color'])
// A date or time field's inner parts lose the browser's 1px of padding under
// Preflight; the field's own padding makes it up (WRAP_DATE, PACK_INPUT), so
// its padding differs by that 1px and its height does not.
const DATE_LIKE = new Set(['date', 'month', 'time', 'datetime-local', 'week'])
const TEXTY = [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
  'outline-color',
  'text-decoration-color',
  'caret-color',
]

/** A record as its fields, read and written by property name. */
const fields = (record) => {
  const parts = record.split('|')
  return {
    parts,
    get: (name) => parts[IDX[name]],
    set: (name, value) => (parts[IDX[name]] = value),
  }
}

const normalise = (record, label, key) => {
  if (record === undefined) return record
  const r = fields(record)
  for (const side of SIDES)
    if (r.get(`border-${side}-width`) === '0px') {
      r.set(`border-${side}-style`, 'none')
      r.set(`border-${side}-color`, '')
    }
  if (r.get('outline-style') === 'none') {
    r.set('outline-width', '0px')
    r.set('outline-color', '')
  }
  // Preflight's html values, deliberate: tab-size 4 and no tap highlight.
  r.set('tab-size', '')
  r.set('-webkit-tap-highlight-color', '')
  // A button's `appearance` is `button` in Preflight, `auto` in the browser:
  // the same painting for a button, and the only way iOS honours its radius.
  if (r.get('appearance') === 'button') r.set('appearance', 'auto')
  // vertical-align only moves an inline-level box or a table cell.
  if (!INLINE.has(r.get('display'))) r.set('vertical-align', '')
  // `max-width: 100%` only shrinks an image that would overflow; the width it
  // is drawn at is compared as its own field.
  if (r.get('max-width') === '100%') r.set('max-width', 'none')
  // html's own font: body sets both, and nothing sits outside body.
  if (key === 'html[0]') {
    r.set('font-family', '')
    r.set('line-height', '')
  }
  // Generated content is border-box under Preflight and was content-box
  // before. That alone changes nothing: a generated box whose size depends on
  // it moves its own offsets or its neighbours' widths, and those are compared.
  if (/::(before|after)$/.test(key)) r.set('box-sizing', '')
  const kind = (meta[label] ?? {})[key.replace(/::.*$/, '')] ?? ''
  const type = /^input\[(\w+)\]/.exec(kind)?.[1]
  if (!key.includes('::') && NO_TEXT.has(type))
    for (const name of TEXTY) r.set(name, '')
  // A button with no text in it (the map's pin is a 22px square holding a
  // drawn mark), and what is drawn inside it, has no text to set in a font; the
  // mark is painted from tokens, never from currentcolor.
  const text = (meta[label] ?? {})[key.replace(/::.*$/, '')]?.split(' | ')[1]
  const inButton = key
    .replace(/::.*$/, '')
    .split('>')
    .some((part) => part.startsWith('button['))
  // The action sheet's dead z-index 40 is deleted (slice H): a modal dialog
  // is in the top layer, where z-index does nothing.
  if (/\bshelf-sheet\b/.test(kind)) r.set('z-index', '')
  if (DATE_LIKE.has(type)) {
    r.set('padding-top', '')
    r.set('padding-bottom', '')
  }
  // A comic cover tile (CoverWall's button and its frame) holds an image and a
  // label that sets its own font; the button and frame have no text to set.
  if (
    /\.cover-tile-(btn|frame)\b/.test(kind) ||
    /\bcover-tile-(btn|frame) /.test(kind)
  )
    for (const name of [...TEXTY, 'appearance']) r.set(name, '')
  if (inButton && text === '' && !key.includes('::'))
    for (const name of TEXTY) r.set(name, '')
  return r.parts.join('|')
}

/**
 * An absolutely positioned generated box that fills its parent (every offset
 * 0) is the same box under either box-sizing: only the size `getComputedStyle`
 * reports differs, by the border and padding. The stacked poster's second card
 * is one.
 */
const filling = (raw) => {
  const r = fields(raw)
  return (
    r.get('position') === 'absolute' &&
    ['top', 'right', 'bottom', 'left'].every((side) => r.get(side) === '0px')
  )
}

const same = (label, key, x, y) => {
  if (
    x !== undefined &&
    y !== undefined &&
    /::(before|after)$/.test(key) &&
    filling(x) &&
    filling(y)
  ) {
    const [p, q] = [fields(x), fields(y)]
    for (const name of ['width', 'height']) {
      p.set(name, '')
      q.set(name, '')
    }
    x = p.parts.join('|')
    y = q.parts.join('|')
  }
  x = normalise(x, label, key)
  y = normalise(y, label, key)
  if (x === y) return true
  if (x === undefined || y === undefined || !jobsRow(label, key)) return false
  const [p, q] = [x.split('|'), y.split('|')]
  p[IDX.width] = q[IDX.width] = ''
  return p.join('|') === q.join('|')
}

let scenarios = 0
let elements = 0
let diffs = 0
const lines = []
for (const label of new Set([...Object.keys(a), ...Object.keys(b)])) {
  scenarios++
  const x = a[label] ?? {}
  const y = b[label] ?? {}
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    elements++
    if (!same(label, key, x[key], y[key])) {
      diffs++
      if (lines.length < (Number(process.env.MAX) || 60))
        lines.push(`${label} :: ${key}\n  - ${x[key]}\n  + ${y[key]}`)
    }
  }
}
console.log(
  `${scenarios} scenarios, ${elements} element records compared, ${diffs} differing`,
)
if (diffs) {
  console.log(lines.join('\n'))
  process.exit(1)
}
