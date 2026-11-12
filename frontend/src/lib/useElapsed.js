import { useEffect, useState } from 'react'

/**
 * Whole seconds since `active` last became true, ticking once a second;
 * 0 while inactive. For a wait that says how long it has been going.
 *
 * @param {boolean} active
 * @returns {number}
 */
export function useElapsed(active) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const start = Date.now()
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    )
    return () => {
      clearInterval(timer)
      setSeconds(0)
    }
  }, [active])
  return active ? seconds : 0
}
