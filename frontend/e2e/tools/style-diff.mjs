// Diffs two style-dump.mjs outputs: node e2e/tools/style-diff.mjs a.json b.json
import { readFileSync } from 'node:fs'

const [a, b] = process.argv
  .slice(2)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
// style-dump.mjs PROPS order: the jobs table's rows are listed in a different
// order on each load of the mocked /admin/jobs (a timing tie in the page's
// own sort), which moves the widths of the links in them between runs of the
// same build. Those widths are not compared.
const WIDTH = 32
const jobsRow = (label, key) =>
  label.endsWith('/admin/jobs') && key.includes('>tbody[')
// A border with no width is not drawn whatever its style: Preflight's
// `border: 0 solid` and the browser's `none` are the same on screen, and a
// width that changes still shows up as its own difference. Compared as equal.
const STYLE = 24
const WIDTH_TOP = 20
const unstyled = (record) => {
  if (record === undefined) return record
  const parts = record.split('|')
  if (parts[WIDTH_TOP] === '0px') parts[STYLE] = 'none'
  return parts.join('|')
}
const same = (label, key, x, y) => {
  x = unstyled(x)
  y = unstyled(y)
  if (x === y) return true
  if (x === undefined || y === undefined || !jobsRow(label, key)) return false
  const [p, q] = [x.split('|'), y.split('|')]
  p[WIDTH] = q[WIDTH] = ''
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
      if (lines.length < 60)
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
