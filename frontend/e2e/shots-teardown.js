import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { shotsDir } from './shots-dir.js'

/** Merges the per-test error files (one per test, so workers never collide). */
export default function teardown() {
  const dir = `${shotsDir}/.errors`
  const all = existsSync(dir)
    ? readdirSync(dir)
        .sort()
        .map((name) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')))
    : []
  writeFileSync(`${shotsDir}/errors.json`, `${JSON.stringify(all, null, 2)}\n`)
  rmSync(dir, { recursive: true, force: true })
  console.log(
    `shots: ${all.length} page(s) with errors -> ${shotsDir}/errors.json`,
  )
}
