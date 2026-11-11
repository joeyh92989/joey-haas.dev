import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiFetch, errorMessage } from '../../lib/api.js'
import {
  addPath,
  fieldPayload,
  localToday,
  meterCounts,
  sittingLabel,
} from '../../lib/intake.js'
import { useMediaQuery } from '../../lib/useMediaQuery.js'
import AddBar from './AddBar.jsx'
import AddDrawer from './AddDrawer.jsx'
import AddResults from './AddResults.jsx'

const NO_ANSWER = 'The server did not answer; try again.'

/** The newest unfinished sitting as one line, with Resume. */
function UnfinishedLine({ sittings, area }) {
  if (!sittings?.length) return null
  const [newest, ...rest] = sittings
  const counts = meterCounts(newest)
  const label = newest.label ?? 'A sitting'
  return (
    <p className="intake-resume">
      <span>
        <b>{label}</b> is unfinished · {counts.check} to check, {counts.ready}{' '}
        ready
        {rest.length > 0 && (
          <>
            {' · '}
            <Link to={addPath(area)}>{rest.length} more on the Add page</Link>
          </>
        )}
      </span>
      <Link
        className="btn"
        to={`${addPath(area)}/${newest.id}`}
        aria-label={`Resume ${label}`}
      >
        Resume <span aria-hidden="true">→</span>
      </Link>
    </p>
  )
}

/**
 * The add bar and everything it opens, above an area's grid (`children`):
 * search on submit across every configured source (the shelf), or type a
 * piece by hand (the Closet); the results; the unfinished sitting line;
 * and the single-add drawer beside the grid, or a bottom sheet below
 * 900px. A single add goes through `POST /api/intake/add`, the sitting's
 * own commit service, so it writes the row a sitting would. Drafts never
 * show in the grid: an unfinished sitting is one line with Resume.
 *
 * @param {object} props
 * @param {'shelf'|'closet'} props.area
 * @param {() => void} [props.onAdded] Something was added; reload the grid.
 * @param {import('react').ReactNode} props.children The area's grid.
 */
export default function AddSection({ area, onAdded, children }) {
  const navigate = useNavigate()
  const sheet = useMediaQuery('(max-width: 900px)')
  const inputRef = useRef(null)
  const openerRef = useRef(null)
  const [kinds, setKinds] = useState(null)
  const [sittings, setSittings] = useState(null)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [adding, setAdding] = useState(false)
  const [drawerError, setDrawerError] = useState(null)
  const [refusals, setRefusals] = useState({})

  useEffect(() => {
    let live = true
    Promise.all([
      apiFetch('/api/intake/kinds'),
      apiFetch(`/api/intake/sittings?area=${area}`),
    ])
      .then(async ([kindsAnswer, sittingsAnswer]) => {
        if (!live) return
        // Only lists are taken: the bar must never break the page under it.
        const listed = async (response) => {
          if (!response.ok) return null
          const body = await response.json()
          return Array.isArray(body) ? body : null
        }
        const [kindList, sittingList] = await Promise.all([
          listed(kindsAnswer),
          listed(sittingsAnswer),
        ])
        if (!live) return
        if (kindList) setKinds(kindList)
        if (sittingList) setSittings(sittingList)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [area])

  const areaKinds = (kinds ?? []).filter((kind) => kind.area === area)
  const byKey = Object.fromEntries(areaKinds.map((kind) => [kind.key, kind]))
  const searchable = areaKinds.some((kind) => kind.ways_in.includes('search'))
  const typedKinds = areaKinds.filter((kind) => kind.ways_in.includes('type'))

  function openDrawer(next, opener) {
    openerRef.current = opener
    setDrawerError(null)
    setRefusals({})
    setDrawer(next)
  }

  function closeDrawer() {
    setDrawer(null)
    const opener = openerRef.current
    setTimeout(() => (opener?.isConnected ? opener : inputRef.current)?.focus())
  }

  async function submit() {
    const text = query.trim()
    setError(null)
    setNotice('')
    if (!searchable) {
      // The Closet: type-only, so submitting is the drawer for its one kind.
      if (typedKinds.length > 0) {
        openDrawer(
          { kind: typedKinds[0], chosen: null, typed: text },
          inputRef.current,
        )
      }
      return
    }
    setBusy(true)
    try {
      const response = await apiFetch(
        `/api/intake/search?area=${area}&query=${encodeURIComponent(text)}`,
      )
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      setAnswer({ query: text, ...(await response.json()) })
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  async function photos() {
    const photoKinds = areaKinds.filter((kind) =>
      kind.ways_in.includes('photo'),
    )
    if (photoKinds.length !== 1) {
      navigate(addPath(area))
      return
    }
    // One photo kind (the Closet): straight to Shoot.
    const [kind] = photoKinds
    setBusy(true)
    setError(null)
    try {
      const response = await apiFetch('/api/intake/sittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area,
          kind: kind.key,
          label: sittingLabel(kind),
        }),
      })
      if (!response.ok) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const sitting = await response.json()
      navigate(`${addPath(area)}/${sitting.id}`)
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  async function add({ title, values }, again) {
    const { kind, chosen } = drawer
    const payload = fieldPayload(kind.fields, values)
    if (title !== undefined) payload.title = title.trim()
    const name = chosen?.title ?? payload.title ?? payload.name ?? drawer.typed
    setAdding(true)
    setDrawerError(null)
    setRefusals({})
    try {
      const response = await apiFetch('/api/intake/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: kind.key,
          chosen,
          payload,
          today: localToday(),
        }),
      })
      if (response.status === 422) {
        const body = await response.json()
        const byField = {}
        for (const refusal of body.refused ?? []) {
          if (refusal.field) byField[refusal.field] = refusal.message
        }
        setRefusals(byField)
        // The drawer draws a refusal only under the kind's own fields (the
        // typed title shows none), so any other field's refusal, or one
        // naming no field, is said once above the actions.
        const drawn = new Set(kind.fields.map((field) => field.key))
        const undrawn = (body.refused ?? []).some(
          (refusal) => !refusal.field || !drawn.has(refusal.field),
        )
        if (undrawn || Object.keys(byField).length === 0) {
          setDrawerError(body.detail)
        }
        return
      }
      if (!response.ok) {
        setDrawerError(await errorMessage(response, { ownConflicts: true }))
        return
      }
      const body = await response.json()
      // An owned comic series gains the typed issues (Got it's rule).
      const issuesAdded = body.issues_added ?? 0
      setNotice(
        body.added
          ? area === 'closet'
            ? `${name} added to the closet`
            : `${name} added, private`
          : issuesAdded > 0
            ? `Added ${issuesAdded} ${issuesAdded === 1 ? 'issue' : 'issues'} to ${name}`
            : `${name} is already on the shelf`,
      )
      onAdded?.()
      if (again) {
        setDrawer(null)
        setAnswer(null)
        setQuery('')
        setTimeout(() => inputRef.current?.focus())
      } else {
        closeDrawer()
      }
    } catch {
      setDrawerError(NO_ANSWER)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="intake-add">
      <AddBar
        searchable={searchable}
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        onPhotos={photos}
        busy={busy || !kinds}
        inputRef={inputRef}
      />
      <p className="visually-hidden" role="status">
        {busy ? 'Searching…' : notice}
      </p>
      {notice && !busy && <p className="muted intake-notice">{notice}</p>}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <AddResults
          query={answer.query}
          results={answer.results}
          sources={answer.sources}
          kinds={byKey}
          onAdd={(result, opener) =>
            openDrawer(
              { kind: byKey[result.kind], chosen: result, typed: answer.query },
              opener,
            )
          }
          onKeepTyped={(kind, opener) =>
            openDrawer({ kind, chosen: null, typed: answer.query }, opener)
          }
        />
      )}
      <UnfinishedLine sittings={sittings} area={area} />
      <div
        className="intake-withdrawer"
        data-drawer={drawer && !sheet ? 'open' : undefined}
      >
        <div className="intake-withdrawer-main">{children}</div>
        {drawer && (
          <AddDrawer
            key={`${drawer.kind.key}:${drawer.chosen?.external_id ?? drawer.typed}`}
            kind={drawer.kind}
            chosen={drawer.chosen}
            typed={drawer.typed}
            sheet={sheet}
            busy={adding}
            error={drawerError}
            refusals={refusals}
            onAdd={add}
            onClose={closeDrawer}
          />
        )}
      </div>
    </div>
  )
}
