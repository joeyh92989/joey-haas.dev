import { resolve } from 'node:path'

/** frontend/e2e-shots, independent of the working directory. */
export const shotsDir = resolve(import.meta.dirname, '../e2e-shots')
