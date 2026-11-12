import { useCallback, useState } from 'react'

/**
 * Wraps a read hook's `retry` for pages with owner actions. After a write
 * went through, `refresh()` re-reads the page and resolves once that read
 * has landed or failed, so a caller's busy flag can wait on it. If the
 * re-read failed, `afterWrite` is true and the page shows the write-aware
 * line (`SAVED_NOT_REFRESHED`) instead of the plain stale one, until a
 * later read lands. `tryAgain` is for the Try again button.
 *
 * @param {() => Promise<{failed: boolean}>} retry
 * @returns {{
 *   refresh: () => Promise<{failed: boolean}>,
 *   tryAgain: () => Promise<{failed: boolean}>,
 *   afterWrite: boolean,
 * }}
 */
export function useRefreshAfterWrite(retry) {
  const [afterWrite, setAfterWrite] = useState(false)
  const refresh = useCallback(async () => {
    const result = await retry()
    setAfterWrite(result.failed)
    return result
  }, [retry])
  const tryAgain = useCallback(async () => {
    const result = await retry()
    if (!result.failed) setAfterWrite(false)
    return result
  }, [retry])
  return { refresh, tryAgain, afterWrite }
}
