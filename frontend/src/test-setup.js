import { beforeEach } from 'vitest'
import { configure } from '@testing-library/react'
import * as snapshot from './lib/snapshot.js'

// findBy* and waitFor stop at 1 s by default, tuned for an idle machine.
// They return as soon as their condition holds, so a higher ceiling costs
// nothing when the machine is quiet and stops a loaded one failing (#244).
configure({ asyncUtilTimeout: 10000 })

// readSnapshot caches per page load; each test starts a new one.
beforeEach(() => {
  snapshot.resetSnapshotCache?.()
})
