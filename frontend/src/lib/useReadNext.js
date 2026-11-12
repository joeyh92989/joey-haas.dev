import { useEffect, useRef, useState } from 'react'
import { READER_TIMEOUT } from '../content/status.js'
import { apiFetch, errorMessage } from './api.js'
import { WaitTimeout, withDeadline } from './waits.js'

/** How long the sitting's re-fetch after a failed read may take. */
const REFETCH_DEADLINE_MS = 20_000

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A sitting's reader: reads its waiting photos one at a time through
 * `read-next` while the sitting page is open (spec D4), whichever step is
 * showing, so checking can start while later photos are still being read.
 * Each answer is merged into the sitting (its photo, and the entries read
 * from it), so Check shows them as they land. It stops when nothing waits,
 * when the day's model budget is spent, and when the page unmounts: no
 * request is sent after that.
 *
 * On the sitting's first load it starts by itself when a photo is waiting
 * (a reload picks up where the last tab left off). A closet sitting is
 * never read here: its photos become garments on upload.
 *
 * @param {object} options
 * @param {object|null} options.sitting The sitting, null while loading.
 * @param {{remaining: number, enforced: boolean}|null} options.budget
 * @param {(update: (sitting: object) => object) => void} options.onChange
 *   The sitting's state setter.
 * After a deadline or a network error the sitting is read again from the
 * server (it has usually finished or failed that read), and `readAgain`
 * clears the error and restarts the loop.
 *
 * @returns {{drive: () => Promise<void>, merge: (photo: object,
 *   entries?: object[]) => void, forget: (photoId: string) => void, budgetSpent: boolean, readingId: string|null, announcement: string,
 *   error: string|null, setError: (error: string|null) => void,
 *   readFailed: boolean, readAgain: () => void}}
 */
export function useReadNext({ sitting, budget, onChange }) {
  const [readSpent, setReadSpent] = useState(false)
  // Spent before the page opened, or by a read since.
  const budgetSpent =
    readSpent || Boolean(budget?.enforced && budget.remaining <= 0)
  const [announcement, setAnnouncement] = useState('')
  const [error, setErrorState] = useState(null)
  // The error is the reader's own timeout or network failure: Read again fits.
  const [readFailed, setReadFailed] = useState(false)
  const setError = (next) => {
    setErrorState(next)
    setReadFailed(false)
  }
  // The photo whose read-next is in flight: the server has claimed it, but
  // the sitting shows it `uploaded` until the answer lands.
  const [readingId, setReadingId] = useState(null)
  const running = useRef(false)
  const again = useRef(false)
  const alive = useRef(true)
  const spent = useRef(budgetSpent)
  spent.current = budgetSpent
  const started = useRef(false)
  // Photos removed in this session: a read answered after the removal must
  // not bring the photo or its titles back.
  const removed = useRef(new Set())
  // The sitting and photo order, read by the loop after renders it cannot see.
  const current = useRef(sitting)
  current.current = sitting
  const order = useRef([])
  order.current = sitting ? sitting.photos.map((p) => p.id) : []

  // Deliberately not aborted on unmount: the `alive` guards below stop
  // every state update and the loop, and the server finishes its read anyway.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Replaces the sitting with the server's, best effort. */
  async function refetch(sittingId) {
    try {
      const fresh = await withDeadline(
        async (signal) => {
          const response = await apiFetch(`/api/intake/sittings/${sittingId}`, {
            signal,
          })
          return response.ok ? response.json() : null
        },
        { ms: REFETCH_DEADLINE_MS },
      )
      if (!fresh || !alive.current) return
      onChange(() => ({
        ...fresh,
        photos: fresh.photos.filter((p) => !removed.current.has(p.id)),
      }))
    } catch {
      // The reader's error already says the server did not answer; a hung
      // re-fetch gives up at its own deadline.
    }
  }

  /** Merges a photo, and any entries read from it, into the sitting. */
  function merge(photo, entries = []) {
    if (removed.current.has(photo.id)) return
    onChange((old) => {
      const known = old.photos.some((p) => p.id === photo.id)
      return {
        ...old,
        photos: known
          ? old.photos.map((p) => (p.id === photo.id ? photo : p))
          : [...old.photos, photo],
        entries: [...old.entries, ...entries],
      }
    })
  }

  /** Remembers a removed photo so a late read of it is never merged back. */
  function forget(photoId) {
    removed.current.add(photoId)
  }

  /** Reads waiting photos one at a time until none waits or the budget is out. */
  async function drive() {
    const now = current.current
    if (!now || now.area === 'closet' || spent.current) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    let failed = false
    try {
      for (;;) {
        if (!alive.current) return
        again.current = false
        // The server claims the oldest waiting photo, so that is the one
        // this call reads. The deadline covers the body too.
        const next = current.current?.photos.find((p) => p.state === 'uploaded')
        setReadingId(next ? next.id : null)
        const result = await withDeadline(async (signal) => {
          const response = await apiFetch(
            `/api/intake/sittings/${now.id}/read-next`,
            { method: 'POST', signal },
          )
          if (!response.ok) {
            return {
              message: await errorMessage(response, { ownConflicts: true }),
            }
          }
          return { body: await response.json() }
        })
        if (!alive.current) return
        setReadingId(null)
        if (result.message !== undefined) {
          setError(result.message)
          return
        }
        const body = result.body
        if (body.photo) merge(body.photo, body.entries)
        const number = body.photo
          ? order.current.indexOf(body.photo.id) + 1 || order.current.length + 1
          : null
        if (body.status === 'read') {
          setAnnouncement(
            `Photo ${number} read, ${plural(body.entries.length, 'title')}`,
          )
        } else if (body.status === 'empty') {
          setAnnouncement(`Photo ${number} read, nothing found`)
        } else if (body.status === 'failed') {
          setAnnouncement(`Photo ${number} failed to read`)
        } else if (body.status === 'waiting') {
          spent.current = true
          setReadSpent(true)
          setAnnouncement('Today’s model budget is used up; photos wait')
          return
        } else if (!again.current) {
          return // idle, and nothing new was uploaded meanwhile
        }
      }
    } catch (caught) {
      if (alive.current) {
        // Nothing is in flight any more, whatever the server did with it.
        setReadingId(null)
        setErrorState(
          caught instanceof WaitTimeout
            ? READER_TIMEOUT
            : 'The server did not answer; try again.',
        )
        failed = true
      }
    } finally {
      if (alive.current) setReadingId(null)
      running.current = false
    }
    // After the loop has ended, so Read again always starts a fresh one:
    // show the server's state, then offer it.
    if (failed && alive.current) {
      await refetch(now.id)
      if (alive.current && !running.current) setReadFailed(true)
    }
  }

  /** Clears the reader's error and starts reading again. */
  function readAgain() {
    setError(null)
    drive()
  }

  useEffect(() => {
    // Once, when the sitting first loads: pick up any waiting photo once
    // the page has painted.
    if (!sitting || started.current) return
    started.current = true
    if (!sitting.photos.some((p) => p.state === 'uploaded')) return
    const timer = setTimeout(drive)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitting])

  return {
    drive,
    merge,
    forget,
    budgetSpent,
    readingId,
    announcement,
    error,
    setError,
    readFailed,
    readAgain,
  }
}
