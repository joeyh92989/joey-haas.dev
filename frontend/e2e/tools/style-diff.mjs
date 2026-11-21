// Diffs two style-dump.mjs outputs: node e2e/tools/style-diff.mjs a.json b.json
import { readFileSync } from 'node:fs'

const [a, b] = process.argv
  .slice(2)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))
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
    if (x[key] !== y[key]) {
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
