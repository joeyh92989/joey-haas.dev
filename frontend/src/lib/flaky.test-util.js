import { useState } from 'react'

/**
 * A stand-in for `useSnapshotThenLive` / `useLiveRead` that fails until the
 * page calls `retry()`, then answers with `ready`. For page tests that mock
 * the read hook: they click Try again and see the data.
 *
 * @param {object} ready The `{ data, live, failed }` answer after the retry.
 * @returns {() => object} A hook; call it from the mock.
 */
export function flaky(ready) {
  return function useFlakyRead() {
    const [retried, setRetried] = useState(false)
    return retried
      ? { failed: false, ...ready, retry: () => {} }
      : {
          data: null,
          live: false,
          failed: true,
          retry: () => setRetried(true),
        }
  }
}
