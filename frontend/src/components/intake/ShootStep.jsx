import { useEffect, useRef, useState } from 'react'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { PHOTO_ACCEPT } from '../../lib/closet.js'
import { refuseFile } from '../../lib/intake.js'
import PhotoTile, { PendingTile } from './PhotoTile.jsx'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The sitting's running line: titles so far and what is still to come. */
function runningLine(sitting, budgetSpent) {
  const { photos, entries } = sitting
  const count = (state) => entries.filter((e) => e.state === state).length
  const reading = photos.filter((p) => p.state === 'reading').length
  const queued = photos.filter((p) => p.state === 'uploaded').length
  const parts = [
    `${count('exact')} matched exactly`,
    `${count('check')} need a look`,
  ]
  if (reading) parts.push(`${plural(reading, 'photo')} reading`)
  if (queued) {
    parts.push(
      budgetSpent
        ? `${queued} waiting: today’s model budget is used up`
        : `${queued} queued`,
    )
  }
  return { head: `${plural(entries.length, 'title')} so far`, rest: parts }
}

/**
 * Sitting step 1: take or choose photos. Each photo is refused before
 * upload when the server would refuse it (type, size: named), uploaded on
 * its own request, and read one at a time through `read-next` while this
 * page is open (spec D4); the nightly reads whatever is left. One polite
 * live region announces each read ("Photo 3 read, 11 titles").
 *
 * A shelf photo waits in the queue when the day's model budget is spent and
 * says so; a closet photo becomes an untagged garment at once and is never
 * read here (the Closet's tag queue names it).
 *
 * @param {object} props
 * @param {object} props.sitting The sitting with its photos and entries.
 * @param {(update: (sitting: object) => object) => void} props.onChange
 * @param {{remaining: number, enforced: boolean}|null} props.budget
 * @param {() => void} props.onNext Start checking.
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 */
export default function ShootStep({
  sitting,
  onChange,
  budget,
  onNext,
  headingRef,
}) {
  const closet = sitting.area === 'closet'
  const [uploads, setUploads] = useState([])
  const [refusals, setRefusals] = useState([])
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState(null)
  const [budgetSpent, setBudgetSpent] = useState(
    Boolean(budget?.enforced && budget.remaining <= 0),
  )
  const running = useRef(false)
  const again = useRef(false)
  const alive = useRef(true)
  const spent = useRef(budgetSpent)
  // The photo order, read by the reader loop after renders it cannot see.
  const order = useRef(sitting.photos.map((p) => p.id))
  order.current = sitting.photos.map((p) => p.id)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Merges a photo, and any entries read from it, into the sitting. */
  function merge(photo, entries = []) {
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

  /** Reads waiting photos one at a time until none waits or the budget is out. */
  async function drive() {
    if (closet || spent.current) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    try {
      for (;;) {
        again.current = false
        const response = await apiFetch(
          `/api/intake/sittings/${sitting.id}/read-next`,
          { method: 'POST' },
        )
        if (!alive.current) return
        if (!response.ok) {
          setError(await errorMessage(response, { ownConflicts: true }))
          return
        }
        const body = await response.json()
        if (!alive.current) return
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
          setBudgetSpent(true)
          setAnnouncement('Today’s model budget is used up; photos wait')
          return
        } else if (!again.current) {
          return // idle, and nothing new was uploaded meanwhile
        }
      }
    } catch {
      if (alive.current) setError('The server did not answer; try again.')
    } finally {
      running.current = false
    }
  }

  useEffect(() => {
    // A reload in Shoot picks up where the last tab left off, once the
    // page has painted.
    if (!sitting.photos.some((p) => p.state === 'uploaded')) return
    const timer = setTimeout(drive)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function upload(files) {
    setError(null)
    const refused = []
    const accepted = []
    for (const file of files) {
      const reason = refuseFile(file)
      if (reason) refused.push(reason)
      else accepted.push(file)
    }
    setRefusals(refused)
    for (const file of accepted) {
      const key = `${file.name}-${Math.random()}`
      setUploads((old) => [...old, { key, name: file.name }])
      const form = new FormData()
      form.append('photo', file)
      try {
        const response = await apiFetch(
          `/api/intake/sittings/${sitting.id}/photos`,
          { method: 'POST', body: form },
        )
        if (!alive.current) return
        if (!response.ok) {
          const message = await errorMessage(response, { ownConflicts: true })
          setUploads((old) =>
            old.map((u) => (u.key === key ? { ...u, error: message } : u)),
          )
          continue
        }
        const photo = await response.json()
        setUploads((old) => old.filter((u) => u.key !== key))
        if (closet) {
          // The garment and its entry are made on upload; read them back.
          const again = await apiFetch(`/api/intake/sittings/${sitting.id}`)
          if (again.ok && alive.current) {
            const fresh = await again.json()
            onChange(() => fresh)
          }
        } else {
          merge(photo)
          drive()
        }
      } catch {
        setUploads((old) =>
          old.map((u) =>
            u.key === key ? { ...u, error: 'the upload did not finish' } : u,
          ),
        )
      }
    }
  }

  async function retry(photo) {
    setError(null)
    const response = await apiFetch(`/api/intake/photos/${photo.id}/retry`, {
      method: 'POST',
    })
    if (!response.ok) {
      setError(await errorMessage(response, { ownConflicts: true }))
      return
    }
    merge(await response.json())
    drive()
  }

  const picked = (event) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    upload(files)
  }

  const titlesFrom = (photo) =>
    sitting.entries.filter((e) => e.photo_id === photo.id).length
  const line = runningLine(sitting, budgetSpent)
  const ready = closet
    ? sitting.entries.length > 0
    : sitting.photos.some((p) => p.state === 'read')

  return (
    <section className="intake-step" aria-labelledby="intake-step-heading">
      <h2 id="intake-step-heading" ref={headingRef} tabIndex={-1}>
        Shoot
      </h2>
      <div className="intake-drop">
        <p className="intake-drop-title">
          {closet
            ? 'Photograph each piece on its own'
            : 'Photograph the shelf, spines or covers facing you'}
        </p>
        <p className="muted">
          {closet
            ? 'Each photo becomes a piece at once; the Closet’s tag queue names it.'
            : '15 to 20 per photo reads best. Keep shooting: each photo is read as it lands.'}
        </p>
        {!closet && (
          <p className="muted">
            {budget?.enforced
              ? `About 1 model call per photo; ${budget.remaining} left today.`
              : 'About 1 model call per photo.'}
          </p>
        )}
        <div className="intake-drop-actions">
          <label className="btn primary intake-file">
            Take photos
            <input
              type="file"
              className="visually-hidden"
              accept={PHOTO_ACCEPT}
              capture="environment"
              multiple
              onChange={picked}
            />
          </label>
          <label className="btn intake-file">
            Choose files
            <input
              type="file"
              className="visually-hidden"
              accept={PHOTO_ACCEPT}
              multiple
              onChange={picked}
            />
          </label>
        </div>
      </div>

      {refusals.length > 0 && (
        <div className="admin-error" role="alert">
          {refusals.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {(sitting.photos.length > 0 || uploads.length > 0) && (
        <ul className="intake-strip" aria-label="Photos">
          {sitting.photos.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              number={index + 1}
              titles={titlesFrom(photo)}
              budgetSpent={budgetSpent}
              onRetry={retry}
            />
          ))}
          {uploads.map((upload) => (
            <PendingTile key={upload.key} upload={upload} />
          ))}
        </ul>
      )}

      <p role="status" className="visually-hidden">
        {announcement}
      </p>

      <div className="intake-bar">
        <p>
          <strong>{line.head}</strong>
          {!closet && (
            <>
              <br />
              <span className="muted">{line.rest.join(' · ')}</span>
            </>
          )}
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          onClick={onNext}
        >
          Start checking <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
