import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router'
import { isbnIntake } from '../../content/isbnIntake.js'
import { linkIntake } from '../../content/linkIntake.js'
import { seedIntake } from '../../content/seedIntake.js'
import { discardAsk } from '../../content/shelfDelete.js'
import { apiFetch, errorMessage } from '../../lib/api.js'
import {
  addPath,
  fieldPayload,
  linesOf,
  localToday,
  looksLikeLink,
  MAX_LINKS,
  meterCounts,
  refuseSeedFile,
  sittingLabel,
  startedAt,
} from '../../lib/intake.js'
import { useMediaQuery } from '../../lib/useMediaQuery.js'
import AddBar from './AddBar.jsx'
import AddDrawer from './AddDrawer.jsx'
import AddResults from './AddResults.jsx'
import { sittingName } from './UnfinishedList.jsx'
import { BOX, ibtn, INTAKE_TEXTAREA } from '../addClasses.js'

const NO_ANSWER = 'The server did not answer; try again.'

/**
 * One unfinished sitting as a line with Resume and Discard; with several,
 * their count and a link to the Add page's list (which has Discard per
 * sitting), so no one is named over another. Discard asks once, in the
 * line, naming the sitting and what goes with it.
 */
function UnfinishedLine({ sittings, area, onDiscard }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const keepRef = useRef(null)
  const discardRef = useRef(null)
  const refocus = useRef(false)
  // Focus moves with the swap, as ConfirmDelete does: onto Keep it when it
  // asks, and back onto Discard when kept.
  useEffect(() => {
    if (asking) keepRef.current?.focus()
    else if (refocus.current) {
      refocus.current = false
      discardRef.current?.focus()
    }
  }, [asking])
  if (!sittings?.length) return null
  const [newest, ...rest] = sittings
  if (rest.length > 0) {
    return (
      <p className={`${BOX} intake-resume`}>
        <span>
          <b>{sittings.length} sittings</b> are unfinished
        </span>
        <Link className={ibtn('plain')} to={addPath(area)}>
          See them on the Add page <span aria-hidden="true">→</span>
        </Link>
      </p>
    )
  }
  const counts = meterCounts(newest)
  const label = sittingName(newest)
  if (asking) {
    return (
      <p
        className={`${BOX} intake-resume`}
        role="group"
        aria-label={`Discard ${label}`}
      >
        <span>{discardAsk(label, newest)}</span>
        <button
          type="button"
          className={ibtn('danger')}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const gone = await onDiscard(newest)
            setBusy(false)
            if (!gone) refocus.current = true
            setAsking(false)
          }}
        >
          Yes, discard
        </button>
        <button
          type="button"
          ref={keepRef}
          className={ibtn('ghost')}
          disabled={busy}
          onClick={() => {
            refocus.current = true
            setAsking(false)
          }}
        >
          Keep it
        </button>
      </p>
    )
  }
  return (
    <p className={`${BOX} intake-resume`}>
      <span>
        <b>{label}</b> is unfinished · {counts.check} to check, {counts.ready}{' '}
        ready
      </span>
      <Link
        className={ibtn('plain')}
        to={`${addPath(area)}/${newest.id}`}
        aria-label={`Resume ${label}`}
      >
        Resume <span aria-hidden="true">→</span>
      </Link>
      <button
        type="button"
        ref={discardRef}
        className={ibtn('ghost')}
        aria-label={`Discard ${label}`}
        onClick={() => setAsking(true)}
      >
        Discard
      </button>
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
  // One id per add action (a drawer opening), reused by its retries so the
  // server writes a book once however many times the request is sent.
  const requestIdRef = useRef(null)
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
  const [linksOpen, setLinksOpen] = useState(false)
  const [linksText, setLinksText] = useState('')
  const context = useOutletContext() ?? {}

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
  const linkKind = areaKinds.find((kind) => kind.ways_in.includes('link'))

  /** Discards the one unfinished sitting; true when it is gone. */
  async function discard(sitting) {
    setError(null)
    try {
      const response = await apiFetch(`/api/intake/sittings/${sitting.id}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 404) {
        setError(await errorMessage(response, { ownConflicts: true }))
        return false
      }
    } catch {
      setError(NO_ANSWER)
      return false
    }
    setSittings((old) => old.filter((s) => s.id !== sitting.id))
    context.refreshIntakeCounts?.()
    return true
  }

  function openDrawer(next, opener) {
    openerRef.current = opener
    requestIdRef.current = null
    setDrawerError(null)
    setRefusals({})
    setDrawer(next)
  }

  function closeDrawer() {
    setDrawer(null)
    const opener = openerRef.current
    setTimeout(() => (opener?.isConnected ? opener : inputRef.current)?.focus())
  }

  async function submit(override) {
    const text = (typeof override === 'string' ? override : query).trim()
    setError(null)
    setNotice('')
    if (linkKind && !searchable && looksLikeLink(text)) {
      // A pasted product link in the Closet's bar is "From links" for one.
      await fromLinks([text])
      return
    }
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

  /**
   * A scanned ISBN: Open Library names the book, and that name is searched
   * like a typed one (the owner still picks the series). A miss or a failure
   * only says so; the bar stays usable.
   */
  async function scanned(isbn) {
    setError(null)
    setNotice('')
    setBusy(true)
    let found
    try {
      const response = await apiFetch(`/api/intake/isbn/${isbn}`)
      const body = response.ok ? await response.json() : null
      found = body?.found ? body.title : null
    } catch {
      found = null
    } finally {
      setBusy(false)
    }
    if (!found) {
      setNotice(isbnIntake.barNotFound(isbn))
      return
    }
    setQuery(found)
    await submit(found)
    setNotice(isbnIntake.barFound(found))
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

  /** "From a file": a sitting, the file into it, then on to its Check. */
  async function fromFile(file) {
    const refused = refuseSeedFile(file, seedIntake)
    setError(refused)
    if (refused) return
    const [kind] = areaKinds.filter((k) => k.ways_in.includes('file'))
    setBusy(true)
    setNotice('')
    try {
      const created = await apiFetch('/api/intake/sittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area,
          kind: kind.key,
          label: seedIntake.label(startedAt(new Date())),
        }),
      })
      if (!created.ok) {
        setError(await errorMessage(created, { ownConflicts: true }))
        return
      }
      const sittingId = (await created.json()).id
      const form = new FormData()
      form.append('file', file)
      const sent = await apiFetch(`/api/intake/sittings/${sittingId}/file`, {
        method: 'POST',
        body: form,
      })
      if (!sent.ok) {
        setError(await errorMessage(sent, { ownConflicts: true }))
        // A file the server refused leaves no empty sitting behind.
        await apiFetch(`/api/intake/sittings/${sittingId}`, {
          method: 'DELETE',
        })
        return
      }
      context.refreshIntakeCounts?.()
      navigate(`${addPath(area)}/${sittingId}`)
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  /** "From links": a sitting, the pasted addresses into it, then Check. */
  async function fromLinks(urls) {
    if (urls.length > MAX_LINKS) {
      setError(linkIntake.tooMany(MAX_LINKS))
      return
    }
    setBusy(true)
    setNotice('')
    setError(null)
    try {
      const created = await apiFetch('/api/intake/sittings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area,
          kind: linkKind.key,
          label: linkIntake.label(startedAt(new Date())),
        }),
      })
      if (!created.ok) {
        setError(await errorMessage(created, { ownConflicts: true }))
        return
      }
      const sittingId = (await created.json()).id
      const sent = await apiFetch(`/api/intake/sittings/${sittingId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      if (!sent.ok) {
        setError(await errorMessage(sent, { ownConflicts: true }))
        // Nothing pasted was an address: no empty sitting is left behind.
        await apiFetch(`/api/intake/sittings/${sittingId}`, {
          method: 'DELETE',
        })
        return
      }
      setLinksOpen(false)
      setLinksText('')
      context.refreshIntakeCounts?.()
      navigate(`${addPath(area)}/${sittingId}`)
    } catch {
      setError(NO_ANSWER)
    } finally {
      setBusy(false)
    }
  }

  async function add({ title, values }, again) {
    const { kind, chosen } = drawer
    requestIdRef.current ??= crypto.randomUUID()
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
          request_id: requestIdRef.current,
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
      if (body.added) context.refreshItems?.()
      // The Closet types one piece after another, so a finished add leaves
      // its bar empty and focused, but only when it added: a duplicate keeps
      // the text so it can be corrected. The Collection keeps the results for
      // adding more from one search, unless the owner asked to go again.
      if (again || (area === 'closet' && body.added)) {
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
        onFile={
          areaKinds.some((kind) => kind.ways_in.includes('file'))
            ? fromFile
            : undefined
        }
        onLinks={linkKind ? () => setLinksOpen((open) => !open) : undefined}
        onScan={area === 'shelf' ? scanned : undefined}
        linksOpen={linksOpen}
        busy={busy || !kinds}
        inputRef={inputRef}
      />
      {linksOpen && linkKind && (
        <form
          className="intake-links"
          aria-label={linkIntake.panelLabel}
          onSubmit={(event) => {
            event.preventDefault()
            const urls = linesOf(linksText)
            if (urls.length > 0) fromLinks(urls)
          }}
        >
          <label htmlFor="intake-links-text">{linkIntake.fieldLabel}</label>
          <textarea
            id="intake-links-text"
            className={INTAKE_TEXTAREA}
            rows={4}
            placeholder={linkIntake.placeholder}
            value={linksText}
            onChange={(event) => setLinksText(event.target.value)}
          />
          <p className="muted">{linkIntake.help(MAX_LINKS)}</p>
          <div className="intake-drawer-actions">
            <button
              type="submit"
              className={ibtn('primary')}
              disabled={busy || linesOf(linksText).length === 0}
            >
              {busy ? linkIntake.reading : linkIntake.read}
            </button>
            <button
              type="button"
              className={ibtn('ghost')}
              onClick={() => setLinksOpen(false)}
            >
              {linkIntake.cancel}
            </button>
          </div>
        </form>
      )}
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
      <UnfinishedLine sittings={sittings} area={area} onDiscard={discard} />
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
