import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/** Merges the per-test error files (one per test, so workers never collide). */
export default function teardown() {
  const dir = 'e2e-shots/.errors'
  const all = readdirSync(dir)
    .sort()
    .map((name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')))
  writeFileSync('e2e-shots/errors.json', `${JSON.stringify(all, null, 2)}\n`)
  rmSync(dir, { recursive: true, force: true })
  console.log(
    `shots: ${all.length} page(s) with errors -> e2e-shots/errors.json`,
  )
}
