import { mkdirSync, rmSync } from 'node:fs'
import { shotsDir } from './shots-dir.js'

/** Starts each run with an empty per-test error directory. */
export default function setup() {
  rmSync(`${shotsDir}/.errors`, { recursive: true, force: true })
  rmSync(`${shotsDir}/errors.json`, { force: true })
  mkdirSync(`${shotsDir}/.errors`, { recursive: true })
}
