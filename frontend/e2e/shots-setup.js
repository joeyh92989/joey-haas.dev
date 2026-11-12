import { mkdirSync, rmSync } from 'node:fs'

/** Starts each run with an empty per-test error directory. */
export default function setup() {
  rmSync('e2e-shots/.errors', { recursive: true, force: true })
  rmSync('e2e-shots/errors.json', { force: true })
  mkdirSync('e2e-shots/.errors', { recursive: true })
}
