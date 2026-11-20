import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { placesAdd } from '../../content/placesAdd.js'
import { HOME_CITY, cityLabel } from '../../lib/cities.js'
import { localToday, sittingLabel } from '../../lib/intake.js'
import { useMediaQuery } from '../../lib/useMediaQuery.js'
import { PHONE_QUERY } from '../AdminShell.jsx'
import ConfirmDelete from '../ConfirmDelete.jsx'
import { fieldsPayload } from './PlaceFields.jsx'
import PasteGroup, { groupButtonId } from './PasteGroup.jsx'
import PasteRow, { rowButtonId, rowFieldId } from './PasteRow.jsx'
import {
  GROUPS,
  MAX_LINES,
  OUTING_GROUPS,
  MAX_PASTE_CHARS as MAX_CHARS,
  addressOf,
  cityOptions,
  countLines,
  fieldsOf,
  groupOf,
  isOuting,
  isPasted,
  kindOf,
  lineOf,
  nameOf,
  nextWaiting,
  outingKindOf,
} from './pasteModel.js'
import { call } from './placeApi.js'

const words = placesAdd.paste
const ow = words.outings

/** How long a "being looked up" or "being saved" answer waits before its one retry. */
const RETRY_WAIT_MS = 1000
/** Rows an open group shows before "Show all": ten, six on a phone. */
const CAP = 10
const PHONE_CAP = 6
/** How many open sittings the resume looks through, newest first. */
const RESUME_LOOK = 5

/** A 409 that clears by itself: another call holds the entry, or a save the list. */
const isBusyAnswer = (answer) =>
  answer.status === 409 && /being looked up|being saved/i.test(answer.message)

/** The server did not answer, or failed: worth one more go. */
const isTransient = (answer) => answer.status === 0 || answer.status >= 500

const keepStates = new Set(['check', 'reading'])

/**
 * The "Paste a list" way on /admin/places/add (story #342, direction A of
 * the mockup a-steps.html): paste one place per line, watch the list
 * resolve one lookup at a time, review it grouped by outcome, and save.
 *
 * It makes its own sitting (separate from the search flow's), keeps it
 * while any line is still to check, and offers to continue it after a
 * reload. Resolving is strictly one call at a time: a queue in this
 * component, an in-flight ref, and no call after the page is left.
 *
 * @param {object} props
 * @param {string[]} props.cities Cities other than Denver, as keys.
 */
export default function PastePlaces({ cities }) {
  const [phase, setPhase] = useState('checking') // checking | offer | paste | review | done | gone
  const [offer, setOffer] = useState(null)
  const [entries, setEntries] = useState([])
  const [text, setText] = useState('')
  const [zero, setZero] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [counts, setCounts] = useState(null)
  const [pasted, setPasted] = useState('')
  const [showText, setShowText] = useState(false)
  const [running, setRunning] = useState(false)
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [failedIds, setFailedIds] = useState(() => new Set())
  const [leftOut, setLeftOut] = useState(() => new Set())
  const [lookupIds, setLookupIds] = useState(() => new Set())
  const [edits, setEdits] = useState({})
  const [openId, setOpenId] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [groupOpen, setGroupOpen] = useState({})
  const [showAll, setShowAll] = useState({})
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [written, setWritten] = useState([])
  // Past outings (story #350): what the lines are, the city of new places
  // (both travel with the paste), and what the last commit refused.
  const [mode, setMode] = useState('places') // places | outings
  const [city, setCity] = useState(HOME_CITY)
  const [refusedIds, setRefusedIds] = useState(() => new Map())
  const phone = useMediaQuery(PHONE_QUERY)
  const cap = phone ? PHONE_CAP : CAP
  // Entries on the page decide what the list is (a resumed list has no mode
  // state); the switch only chooses for the next paste, and is locked then.
  const outings = entries.length ? entries.some(isOuting) : mode === 'outings'

  const alive = useRef(false)
  const sitting = useRef(null) // the sitting's pending request, then {ok, id}
  const working = useRef(false) // a paste, save or edit request is under way
  const inflight = useRef(false) // a resolve call is under way
  const looping = useRef(false)
  const auto = useRef(false) // the queue walks the whole list
  const priority = useRef([]) // {id, row} lookups a row asked for
  const askedIds = useRef(new Set()) // ids with a row lookup queued or under way
  const skip = useRef(new Set()) // entries the queue leaves to "Try again"
  const entriesRef = useRef([])
  const editsRef = useRef({})
  const focusNext = useRef(null)
  const timer = useRef(null)

  // Mounted: the queue may run. Unmounted (the way closed, the page left):
  // it stops, and no call is made after.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      auto.current = false
      priority.current = []
      clearTimeout(timer.current)
    }
  }, [])

  // Focus follows what came back, once it is on the page.
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    let node
    if (target.form) {
      node = document
        .getElementById(`paste-form-${target.form}`)
        ?.querySelector('input, select, button')
    } else node = document.getElementById(target.id)
    if (!node) return
    focusNext.current = null
    node.focus()
  })

  // Reopening the way: is there a list of the owner's still open?
  useEffect(() => {
    let live = true
    ;(async () => {
      const list = await call('/api/intake/sittings?area=places', 'GET')
      if (!live) return
      // The newest few open sittings, newest first: a later search-flow
      // leftover must not hide an older pasted list.
      const open =
        list.ok && Array.isArray(list.data)
          ? list.data
              .filter((s) => Object.values(s.entries ?? {}).some((n) => n > 0))
              .slice(0, RESUME_LOOK)
          : []
      for (const sitting of open) {
        const detail = await call(`/api/intake/sittings/${sitting.id}`, 'GET')
        if (!live) return
        const held = detail.ok ? (detail.data.entries ?? []) : []
        if (held.some(isPasted)) {
          setOffer({ id: sitting.id, entries: held })
          setPhase('offer')
          return
        }
      }
      focusNext.current = { id: 'paste-text' }
      setPhase('paste')
    })()
    return () => {
      live = false
    }
  }, [])

  function putEntries(next) {
    entriesRef.current = next
    setEntries(next)
  }

  function putEntry(entry) {
    const have = entriesRef.current.some((e) => e.id === entry.id)
    putEntries(
      have
        ? entriesRef.current.map((e) => (e.id === entry.id ? entry : e))
        : [...entriesRef.current, entry],
    )
  }

  function setBusy(id, on) {
    setBusyIds((old) => {
      const next = new Set(old)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function flag(setter, id, on) {
    setter((old) => {
      const next = new Set(old)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /** One request at a time for paste, save and edits: a second press in the
   *  same tick is ignored (a disabled button alone is not relied on). */
  async function exclusive(work) {
    if (working.current) return
    working.current = true
    try {
      await work()
    } finally {
      working.current = false
    }
  }

  const sleep = (ms) =>
    new Promise((resolve) => {
      timer.current = setTimeout(resolve, ms)
    })

  // ---- the lookup queue: one resolve in flight, ever ----

  async function drive() {
    if (looping.current) return
    looping.current = true
    try {
      while (alive.current) {
        const asked = priority.current.shift()
        let entry = null
        if (asked) {
          entry = entriesRef.current.find((e) => e.id === asked.id)
          if (!entry) {
            askedIds.current.delete(asked.id)
            continue
          }
        } else if (auto.current) {
          entry = nextWaiting(entriesRef.current, skip.current)
        }
        // One resolve in flight, ever: never start a second one over it.
        if (!entry || inflight.current) break
        await lookUp(entry, asked?.row ?? false)
      }
    } finally {
      looping.current = false
      if (alive.current && auto.current) {
        // The walk ended: nothing is left to look up.
        auto.current = false
        setRunning(false)
      }
    }
  }

  async function lookUp(entry, row) {
    if (inflight.current) return
    inflight.current = true
    setBusy(entry.id, true)
    const path = `/api/intake/entries/${entry.id}/resolve`
    try {
      let answer = await call(path, 'POST')
      if (!alive.current) return
      if (!answer.ok && isBusyAnswer(answer)) {
        await sleep(RETRY_WAIT_MS)
        if (!alive.current) return
        answer = await call(path, 'POST')
      } else if (!answer.ok && isTransient(answer)) {
        answer = await call(path, 'POST')
      }
      if (!alive.current) return
      if (answer.ok) {
        // eslint-disable-next-line no-unused-vars
        const { remaining, ...fresh } = answer.data
        putEntry(fresh)
        flag(setFailedIds, entry.id, false)
        skip.current.delete(entry.id)
        // A line looked up again that still waits is part of the walk now,
        // so Continue and the count know it.
        if (fresh.state === 'reading') {
          setLookupIds((old) => new Set(old).add(fresh.id))
        }
        // A row's notice has been spoken by the time the next lookup lands;
        // leaving it would block the progress announcements.
        if (row) afterRowLookup(fresh)
        else setNotice('')
      } else {
        skip.current.add(entry.id)
        if (entry.state === 'reading') flag(setFailedIds, entry.id, true)
        if (row || entry.state !== 'reading') setError(words.noAnswerRow)
      }
    } finally {
      inflight.current = false
      if (row) askedIds.current.delete(entry.id)
      if (alive.current) setBusy(entry.id, false)
    }
  }

  /** What a row's own lookup gave: say so, and move focus to it. */
  function afterRowLookup(entry) {
    const kind = kindOf(entry, new Set(), new Set())
    const title = nameOf(entry)
    if (kind === 'ready') {
      setNotice(words.foundReady(title))
      focusNext.current = { id: rowButtonId(entry) }
    } else if (kind === 'saved' || kind === 'same') {
      setNotice(
        kind === 'saved' ? words.foundSaved(title) : words.foundSame(title),
      )
      focusNext.current = { id: groupButtonId(kind) }
    } else if (kind === 'wait') {
      setNotice(words.stillCheck(title, words.why.failed.toLowerCase()))
      setGroupOpen((old) => ({ ...old, wait: true }))
      focusNext.current = { id: rowButtonId(entry) }
    } else {
      const why =
        kind === 'several'
          ? words.why.several(entry.payload?.candidates?.length ?? 0)
          : (words.why[kind] ?? '')
      setNotice(words.stillCheck(title, why.toLowerCase()))
      setOpenId(entry.id)
      focusNext.current = { id: rowFieldId(entry) }
    }
  }

  function startWalk() {
    auto.current = true
    setRunning(true)
    drive()
  }

  function stop() {
    auto.current = false
    setRunning(false)
    setNotice('')
    focusNext.current = { id: 'paste-stop' }
  }

  function askLookup(entry) {
    // A second press while the first is queued or running asks for nothing.
    if (askedIds.current.has(entry.id)) return
    askedIds.current.add(entry.id)
    setError('')
    flag(setFailedIds, entry.id, false)
    skip.current.delete(entry.id)
    priority.current.push({ id: entry.id, row: true })
    drive()
  }

  // ---- the sitting ----

  async function ensureSitting() {
    if (!sitting.current) {
      const pending = (async () => {
        const made = await call('/api/intake/sittings', 'POST', {
          area: 'places',
          kind: 'place',
          label: sittingLabel({ label: words.heading }),
        })
        if (!made.ok) {
          if (sitting.current === pending) sitting.current = null
          return made
        }
        return { ok: true, id: made.data.id }
      })()
      sitting.current = pending
    }
    return sitting.current
  }

  // ---- paste ----

  const { total: boxTotal, filled: boxFilled } = countLines(text)

  function addLines(event) {
    event.preventDefault()
    if (text.length > MAX_CHARS) {
      setZero(words.tooBig(MAX_CHARS.toLocaleString('en-US')))
      focusNext.current = { id: 'paste-text' }
      return
    }
    if (!boxFilled) {
      setZero(boxTotal ? words.zeroBlank(boxTotal) : words.zeroEmpty)
      focusNext.current = { id: 'paste-text' }
      return
    }
    return exclusive(async () => {
      setAdding(true)
      setPasteError('')
      setZero('')
      const made = await ensureSitting()
      const answer = made.ok
        ? await call(
            `/api/intake/sittings/${made.id}/paste`,
            'POST',
            outings ? { text, outings: true, city } : { text },
          )
        : made
      if (!alive.current) return
      setAdding(false)
      if (!answer.ok) {
        if (answer.status === 404) sitting.current = null
        if (answer.status === 422) setZero(words.pasteRefused)
        else {
          setPasteError(
            answer.status === 0 || answer.status >= 500
              ? words.pasteFailed
              : answer.message,
          )
        }
        return
      }
      const body = answer.data
      if (!body.added) {
        setZero(
          body.blank >= boxTotal ? words.zeroBlank(boxTotal) : words.zeroKnown,
        )
        focusNext.current = { id: 'paste-text' }
        return
      }
      putEntries([...entriesRef.current, ...body.entries])
      setLookupIds((old) => {
        const next = new Set(old)
        body.entries
          .filter((e) => e.state === 'reading')
          .forEach((e) => next.add(e.id))
        return next
      })
      setCounts({
        added: body.added,
        blank: body.blank,
        duplicates: body.duplicates,
        over: body.over_limit,
      })
      setPasted(text)
      setShowText(false)
      setText('')
      setNotice('')
      setPhase('review')
      if (body.entries.some((e) => e.state === 'reading')) {
        focusNext.current = { id: 'paste-stop' }
        startWalk()
      } else focusNext.current = { id: 'paste-save' }
    })
  }

  // ---- resume ----

  function continueList() {
    sitting.current = Promise.resolve({ ok: true, id: offer.id })
    putEntries(offer.entries)
    const reading = offer.entries.filter((e) => e.state === 'reading')
    setLookupIds(new Set(reading.map((e) => e.id)))
    setCounts(null)
    setOffer(null)
    setPhase('review')
    if (reading.length) {
      focusNext.current = { id: 'paste-stop' }
      startWalk()
    } else focusNext.current = { id: 'paste-save' }
  }

  async function discardOld() {
    const gone = await call(`/api/intake/sittings/${offer.id}`, 'DELETE')
    if (!alive.current) return
    if (!gone.ok && gone.status !== 404) {
      setError(words.resumeFailed)
      return
    }
    setError('')
    setOffer(null)
    setPhase('paste')
    focusNext.current = { id: 'paste-text' }
  }

  // ---- row actions ----

  const valuesFor = (entry) => edits[entry.id] ?? fieldsOf(entry)

  function editValues(entry, values) {
    editsRef.current = { ...editsRef.current, [entry.id]: values }
    setEdits(editsRef.current)
  }

  function toggleRow(entry) {
    if (openId === entry.id) {
      setOpenId(null)
      focusNext.current = { id: rowButtonId(entry) }
    } else {
      setOpenId(entry.id)
      focusNext.current = { form: entry.id }
    }
  }

  function pick(entry, index) {
    return exclusive(async () => {
      setError('')
      setBusy(entry.id, true)
      const answer = await call(
        `/api/intake/entries/${entry.id}/pick`,
        'POST',
        {
          index,
        },
      )
      if (!alive.current) return
      setBusy(entry.id, false)
      if (!answer.ok) return setError(answer.message)
      putEntry(answer.data)
      setOpenId(null)
      const kind = kindOf(answer.data, new Set(), new Set())
      const title = nameOf(answer.data)
      if (kind === 'ready') {
        setNotice(words.pickedReady(title))
        focusNext.current = { id: rowButtonId(answer.data) }
      } else {
        setNotice(
          kind === 'saved' ? words.foundSaved(title) : words.foundSame(title),
        )
        focusNext.current = { id: groupButtonId(kind) }
      }
    })
  }

  /** Rename if the name changed, then look the entry up again. */
  function search(entry, name) {
    return exclusive(async () => {
      setError('')
      let current = entry
      if (name !== nameOf(entry)) {
        const renamed = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
          payload: { name },
        })
        if (!alive.current) return
        if (!renamed.ok) return setError(renamed.message)
        current = renamed.data
        putEntry(current)
      }
      setOpenId(null)
      setNotice('')
      askLookup(current)
    })
  }

  /** A coordinate line with a name now: name it, then mark it ready. */
  function nameIt(entry, name) {
    return exclusive(async () => {
      setError('')
      const renamed = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        payload: { name },
      })
      if (!alive.current) return
      if (!renamed.ok) return setError(renamed.message)
      putEntry(renamed.data)
      const ready = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        state: 'ready',
      })
      if (!alive.current) return
      if (!ready.ok) return setError(ready.message)
      putEntry(ready.data)
      flag(setLeftOut, entry.id, false)
      setOpenId(null)
      setNotice(words.namedReady(nameOf(ready.data)))
      focusNext.current = { id: rowButtonId(ready.data) }
    })
  }

  function leaveOut(entry) {
    return exclusive(async () => {
      setError('')
      const answer = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        state: 'check',
      })
      if (!alive.current) return
      if (!answer.ok) return setError(answer.message)
      putEntry(answer.data)
      flag(setLeftOut, entry.id, true)
      setOpenId(null)
      setNotice(words.leftOutNotice(nameOf(answer.data)))
      focusNext.current = { id: rowButtonId(answer.data) }
    })
  }

  function putBack(entry) {
    return exclusive(async () => {
      setError('')
      const answer = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        state: 'ready',
      })
      if (!alive.current) return
      if (!answer.ok) return setError(answer.message)
      putEntry(answer.data)
      flag(setLeftOut, entry.id, false)
      setNotice(words.putBackNotice(nameOf(answer.data)))
      focusNext.current = { id: rowButtonId(answer.data) }
    })
  }

  /** A past outing's date words: the server reads them and answers the entry. */
  function fixDate(entry, text) {
    return exclusive(async () => {
      setError('')
      setBusy(entry.id, true)
      const answer = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        outing_date_text: text,
      })
      if (!alive.current) return
      setBusy(entry.id, false)
      if (!answer.ok) return setError(answer.message)
      putEntry(answer.data)
      forgetRefusal(entry.id)
      const title = nameOf(answer.data)
      if (answer.data.outing?.visited_on) {
        setOpenId(null)
        setNotice(ow.dateSaved(title, answer.data.outing.label))
        focusNext.current = { id: rowButtonId(answer.data) }
      } else {
        setNotice(ow.dateStill(title))
        focusNext.current = { id: rowFieldId(answer.data) }
      }
    })
  }

  /** Leave a past outing out, skip it, or put it back (`outing_skip`). */
  function skipOuting(entry, skip) {
    return exclusive(async () => {
      setError('')
      const answer = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
        outing_skip: skip,
      })
      if (!alive.current) return
      if (!answer.ok) return setError(answer.message)
      putEntry(answer.data)
      forgetRefusal(entry.id)
      setOpenId(null)
      const title = nameOf(answer.data)
      const logged = Boolean(answer.data.outing?.duplicate_of)
      if (skip)
        setNotice(logged ? ow.skippedNotice(title) : ow.leftOutNotice(title))
      else
        setNotice(logged ? ow.addAnywayNotice(title) : ow.putBackNotice(title))
      focusNext.current = { id: rowButtonId(answer.data) }
    })
  }

  function forgetRefusal(id) {
    setRefusedIds((old) => {
      if (!old.has(id)) return old
      const next = new Map(old)
      next.delete(id)
      return next
    })
  }

  // ---- save ----

  function save() {
    return exclusive(async () => {
      const outingList = entriesRef.current.some(isOuting)
      // A past outing is written when its place is ready or saved and it is
      // neither skipped nor missing a date; the server reads the date again.
      const ready = entriesRef.current.filter((e) =>
        outingList
          ? ['ready', 'owned'].includes(e.state) &&
            !e.outing?.skip &&
            e.outing?.visited_on
          : e.state === 'ready',
      )
      if (!ready.length) return
      setSaving(true)
      setError('')
      const sent = { ...editsRef.current }
      for (const entry of ready) {
        const values = editsRef.current[entry.id]
        if (!values) continue
        const patched = await call(`/api/intake/entries/${entry.id}`, 'PATCH', {
          payload: fieldsPayload(values),
        })
        if (!alive.current) return
        if (!patched.ok) {
          setSaving(false)
          return setError(patched.message)
        }
        putEntry(patched.data)
        const rest = { ...editsRef.current }
        delete rest[entry.id]
        editsRef.current = rest
        setEdits(rest)
      }
      const made = await ensureSitting()
      const outcome = made.ok
        ? await call(`/api/intake/sittings/${made.id}/commit`, 'POST', {
            today: localToday(),
          })
        : made
      if (!alive.current) return
      setSaving(false)
      if (outcome.status === 404) {
        // Another tab saved everything or discarded the list: the id is dead.
        sitting.current = null
        putEntries([])
        setLookupIds(new Set())
        setOpenId(null)
        setNotice('')
        setPhase('gone')
        focusNext.current = { id: 'paste-gone-h' }
        return
      }
      if (!outcome.ok && outingList && outcome.status === 422) {
        const refused = outcome.data?.refused ?? []
        setRefusedIds(
          new Map(
            refused
              .filter((r) => typeof r?.entry_id === 'string')
              .map((r) => [r.entry_id, r.message]),
          ),
        )
        return setError(
          refused.length ? ow.refused(refused.length) : ow.refusedFallback,
        )
      }
      if (!outcome.ok) {
        return setError(
          outcome.message ||
            (outingList ? ow.commitFailed : words.commitFailed),
        )
      }
      setRefusedIds(new Map())
      const data = outcome.data
      const fresh = data.spots_new ?? []
      // The commit writes the ready entries in the order sent and leaves out
      // the ones already owned, so each new spot belongs to the next ready
      // entry of that name: two places with one name keep their own address.
      let from = 0
      const savedNow = fresh.map((spot) => {
        let at = ready.findIndex((e, i) => i >= from && nameOf(e) === spot.name)
        if (at < 0) at = ready.findIndex((e) => nameOf(e) === spot.name)
        if (at >= 0) from = at + 1
        const entry = ready[at]
        return {
          id: spot.id,
          name: spot.name,
          address: entry ? addressOf(entry) : '',
          isPublic: entry
            ? (sent[entry.id] ?? fieldsOf(entry)).isPublic
            : false,
        }
      })
      const owned = entriesRef.current.filter((e) => e.state === 'owned').length
      const logged = entriesRef.current.filter(
        (e) => e.outing?.skip && e.outing.duplicate_of,
      ).length
      const left = entriesRef.current.filter(
        (e) => e.outing?.skip && !e.outing.duplicate_of,
      ).length
      // The commit deletes everything but the lines still to check or look up.
      const kept = entriesRef.current.filter((e) => keepStates.has(e.state))
      if (!(data.skipped_kept > 0)) sitting.current = null
      putEntries(data.skipped_kept > 0 ? kept : [])
      setLookupIds(
        (old) =>
          new Set([...old].filter((id) => kept.some((e) => e.id === id))),
      )
      setWritten((old) => [...savedNow, ...old])
      setDone({
        saved: fresh.length,
        pub: savedNow.filter((s) => s.isPublic).length,
        owned,
        ...(outingList && {
          outings: data.outings_new ?? 0,
          names: fresh.map((spot) => spot.name),
          city: cityLabel(ready[0]?.payload?.city ?? HOME_CITY),
          logged,
          left,
        }),
      })
      setOpenId(null)
      setNotice('')
      setPhase('done')
      focusNext.current = { id: 'paste-done-h' }
    })
  }

  function again() {
    setPhase('paste')
    setZero('')
    setPasteError('')
    setCounts(null)
    setDone(null)
    focusNext.current = { id: 'paste-text' }
  }

  // ---- what the page shows ----

  const kinds = new Map(
    entries.map((e) => [
      e.id,
      isOuting(e)
        ? outingKindOf(e, failedIds, refusedIds)
        : kindOf(e, failedIds, leftOut),
    ]),
  )
  const groupList = outings ? OUTING_GROUPS : GROUPS
  const grouped = Object.fromEntries(groupList.map((g) => [g, []]))
  for (const entry of entries) {
    const group = groupOf(kinds.get(entry.id))
    if (group) grouped[group].push(entry)
  }
  const ready = grouped.ready.length
  const check = grouped.check.length
  const waiting = outings
    ? grouped.wait.length
    : entries.filter((e) => e.state === 'reading' && !failedIds.has(e.id))
        .length
  const newPlaces = new Set(
    grouped.ready
      .filter((e) => e.state === 'ready')
      .map((e) => e.chosen?.source_id ?? nameOf(e)),
  ).size
  const lookups = [...lookupIds]
  const total = lookups.length
  const doneCount = lookups.filter((id) => {
    const entry = entries.find((e) => e.id === id)
    return !entry || entry.state !== 'reading' || failedIds.has(id)
  }).length
  const looking = entries.find(
    (e) => busyIds.has(e.id) && e.state === 'reading',
  )
  const unfinished = total > 0 && doneCount < total

  let status = notice
  if (running && looking) {
    status = words.looking(doneCount, total, lineOf(looking))
  } else if (!running && waiting && total) {
    status = words.stopped(doneCount, total)
  } else if (!notice) {
    const failedRows = grouped.check.filter(
      (e) => kinds.get(e.id) === 'failed',
    ).length
    const tally = outings
      ? ow.tally(ready, check, grouped.logged.length, grouped.out.length)
      : words.tally(ready, check, grouped.saved.length, grouped.same.length)
    status = `${tally}${failedRows ? ` ${words.failedNotice(failedRows)}` : ''}`
  }
  // The live region speaks every tenth lookup, a row's result, and the end.
  let spoken = notice
  if (!spoken && total) {
    if (!unfinished) spoken = words.announceDone
    else if (doneCount >= 10) {
      spoken = words.announce(doneCount - (doneCount % 10), total)
    }
  }

  let saveNote = words.saveNotes.allDone
  if (check) saveNote = words.saveNotes.stays(check)
  if (outings) {
    // Nothing is added while a line is to check or a place is not looked up.
    if (running) saveNote = ow.running
    else if (check || waiting) saveNote = ow.held(check, waiting)
    else if (ready) {
      saveNote = ow.willAdd(ready, newPlaces, grouped.logged.length)
    } else saveNote = ow.nothingReady
  } else if (running) saveNote = words.saveNotes.running
  else if (waiting) saveNote = words.saveNotes.notLooked(waiting)
  else if (!ready) {
    saveNote = check
      ? words.saveNotes.nothingReady
      : words.saveNotes.nothingToSave
  }
  const held = outings && (check > 0 || waiting > 0)

  const citiesFor = (entry) => {
    const own = entry.payload?.city
    return own && own !== 'denver' && !cities.includes(own)
      ? [...cities, own]
      : cities
  }

  function drawRow(entry) {
    const kind = kinds.get(entry.id)
    return (
      <PasteRow
        key={entry.id}
        entry={entry}
        kind={kind}
        open={openId === entry.id}
        busy={busyIds.has(entry.id)}
        values={valuesFor(entry)}
        cities={citiesFor(entry)}
        onToggle={() => toggleRow(entry)}
        onValues={(values) => editValues(entry, values)}
        onPick={(index) => pick(entry, index)}
        onSearch={(name) => search(entry, name)}
        onNameIt={(name) => nameIt(entry, name)}
        onRetry={() => askLookup(entry)}
        onLeaveOut={() => leaveOut(entry)}
        onPutBack={() => putBack(entry)}
        onFixDate={(text) => fixDate(entry, text)}
        onSkip={(skip) => skipOuting(entry, skip)}
        refusal={refusedIds.get(entry.id) ?? ''}
        canRetry={!running}
      />
    )
  }

  const groupIsOpen = (group) =>
    groupOpen[group] ??
    (group === 'ready'
      ? grouped.ready.length <= CAP
      : group === 'wait'
        ? // a line that already got no answer once is shown, not folded away
          grouped.wait.some((e) => (e.payload?.attempts ?? 0) > 0)
        : group !== 'same')

  const summary =
    counts &&
    `${words.added(counts.added)}${words.ignored(counts.blank, counts.duplicates)}${counts.over ? words.overDropped(counts.over) : ''}`

  const showPasteBox = phase === 'paste'
  const hasEntries = entries.length > 0

  const progress = hasEntries && (phase !== 'done' || unfinished) && (
    <div className="place-paste-progress">
      <div className="place-paste-progress-row">
        <p className="place-status" aria-hidden="true">
          {status}
        </p>
        {unfinished &&
          (running ? (
            <button
              type="button"
              className="btn"
              id="paste-stop"
              onClick={stop}
            >
              {words.stop}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              id="paste-stop"
              onClick={() => {
                focusNext.current = { id: 'paste-stop' }
                startWalk()
              }}
            >
              {words.resume}
            </button>
          ))}
      </div>
      {unfinished && (
        <>
          <progress
            className="place-paste-meter"
            aria-label={words.progressLabel}
            value={doneCount}
            max={total}
          />
          <p className="place-hint">
            {running ? words.runningHint : words.stoppedHint}
          </p>
        </>
      )}
    </div>
  )

  return (
    <>
      {pasteError && (
        <div className="admin-error" role="alert">
          <p>{pasteError}</p>
        </div>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {phase === 'done' ? (
        <section className="panel place-done">
          <div className="panel-body place-stack-sm">
            <h2 className="place-done-made" tabIndex={-1} id="paste-done-h">
              {done?.outings != null
                ? ow.doneHeading(done.outings, done.saved)
                : words.savedHeading(done?.saved ?? 0)}
            </h2>
            {done?.outings != null ? (
              <ul className="place-paste-done-list">
                {done.saved > 0 && (
                  <li>{ow.doneNewPlaces(done.city, done.names)}</li>
                )}
                {done.logged > 0 && <li>{ow.doneSkipped(done.logged)}</li>}
                {done.left > 0 && <li>{ow.doneLeftOut(done.left)}</li>}
                {check + waiting > 0 && (
                  <li>{words.stillToCheck(check + waiting)}</li>
                )}
                <li>{ow.doneEmpty}</li>
              </ul>
            ) : (
              <ul className="place-paste-done-list">
                <li>
                  {done?.pub
                    ? words.savedMixed(done.saved - done.pub, done.pub)
                    : words.savedPrivate(done?.saved ?? 0)}
                </li>
                {check + waiting > 0 && (
                  <li>{words.stillToCheck(check + waiting)}</li>
                )}
                {done?.owned > 0 && (
                  <li>{words.alreadySavedCount(done.owned)}</li>
                )}
              </ul>
            )}
            {progress}
            <div className="intake-actions">
              <button type="button" className="btn primary" onClick={again}>
                {done?.outings != null ? ow.addMore : words.addAnother}
              </button>
              {done?.outings != null ? (
                <Link className="btn" to="/admin/history">
                  {ow.openHistory}
                </Link>
              ) : (
                <Link className="btn" to="/admin/spots">
                  {words.viewOnSpots}
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="panel" id="paste-way" aria-labelledby="paste-h">
          <div className="panel-head">
            <h2 id="paste-h">{words.heading}</h2>
          </div>
          <div className="panel-body place-paste-stack">
            {phase === 'checking' && (
              <p className="place-status" role="status">
                {words.checking}
              </p>
            )}
            {phase === 'gone' && (
              <div className="place-paste-offer">
                <p id="paste-gone-h" tabIndex={-1} role="alert">
                  {words.listGone}
                </p>
                <div className="intake-actions">
                  <button type="button" className="btn primary" onClick={again}>
                    {words.startNew}
                  </button>
                </div>
              </div>
            )}
            {phase === 'offer' && offer && (
              <div className="place-paste-offer">
                <p>{words.resumeLead(offer.entries.length)}</p>
                <div className="intake-actions">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={continueList}
                  >
                    {words.resumeContinue(offer.entries.length)}
                  </button>
                  <ConfirmDelete
                    className="btn"
                    label={words.resumeNew}
                    confirmLabel={words.resumeNewConfirm}
                    intro={words.resumeNewIntro}
                    onConfirm={discardOld}
                  />
                </div>
              </div>
            )}
            {(phase === 'paste' || phase === 'review') && (
              <div
                className="outing-mode"
                role="group"
                aria-labelledby="paste-mode-l"
              >
                <span id="paste-mode-l">{ow.modeLabel}</span>
                {[
                  ['places', ow.modePlaces],
                  ['outings', ow.modeOutings],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="chip"
                    aria-pressed={(outings ? 'outings' : 'places') === key}
                    disabled={hasEntries}
                    onClick={() => {
                      setMode(key)
                      setZero('')
                    }}
                  >
                    {label}
                  </button>
                ))}
                {hasEntries && (
                  <span className="place-hint">{ow.modeLocked}</span>
                )}
              </div>
            )}
            {showPasteBox && (
              <form className="place-paste-box" onSubmit={addLines}>
                <div className="intake-field">
                  <label htmlFor="paste-text">
                    {outings ? ow.boxLabel : words.boxLabel}
                  </label>
                  <textarea
                    id="paste-text"
                    rows={hasEntries ? 4 : 8}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={zero ? true : undefined}
                    aria-describedby={[
                      'paste-hint',
                      zero && 'paste-zero',
                      boxTotal > MAX_LINES && 'paste-over',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value)
                      setZero('')
                    }}
                  />
                  <p className="place-hint" id="paste-hint">
                    {outings ? ow.boxHint : words.boxHint}
                  </p>
                  {zero && (
                    <p
                      className="place-field-error"
                      id="paste-zero"
                      role="alert"
                    >
                      {zero}
                    </p>
                  )}
                </div>
                {outings && (
                  <div className="intake-field outing-city">
                    <label htmlFor="paste-city">{ow.cityLabel}</label>
                    <select
                      id="paste-city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                    >
                      {cityOptions(cities).map((key) => (
                        <option key={key} value={key}>
                          {cityLabel(key)}
                        </option>
                      ))}
                    </select>
                    <p className="place-hint">{ow.cityHint}</p>
                  </div>
                )}
                <div className="place-paste-box-foot">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={adding}
                  >
                    {adding ? words.adding : words.addLines}
                  </button>
                  <span className="place-paste-count" id="paste-count">
                    {boxFilled ? words.lineCount(boxFilled) : ''}
                  </span>
                  <span
                    className="place-paste-over"
                    id="paste-over"
                    hidden={boxTotal <= MAX_LINES}
                  >
                    {boxTotal > MAX_LINES ? words.over(boxTotal) : ''}
                  </span>
                </div>
              </form>
            )}
            {phase === 'review' && (
              <div className="place-paste-summary">
                <p>{summary ?? words.inList(entries.length)}</p>
                {pasted && (
                  <button
                    type="button"
                    className="btn ghost"
                    id="paste-show-text"
                    aria-expanded={showText}
                    aria-controls="paste-pasted"
                    onClick={() => setShowText(!showText)}
                  >
                    {showText ? words.hideText : words.showText}
                  </button>
                )}
              </div>
            )}
            {phase === 'review' && showText && (
              <pre
                className="place-paste-pasted"
                id="paste-pasted"
                tabIndex={0}
                aria-label={words.pastedLabel}
              >
                {pasted}
              </pre>
            )}
            {phase !== 'offer' && progress}
          </div>
        </section>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {spoken}
      </p>
      {groupList.map((group) => (
        <PasteGroup
          key={group}
          group={group}
          rows={grouped[group]}
          open={groupIsOpen(group)}
          showAll={Boolean(showAll[group])}
          cap={cap}
          onToggle={() =>
            setGroupOpen((old) => ({ ...old, [group]: !groupIsOpen(group) }))
          }
          onShowAll={() =>
            setShowAll((old) => ({ ...old, [group]: !old[group] }))
          }
        >
          {drawRow}
        </PasteGroup>
      ))}
      {hasEntries && (
        <p className="place-osm">
          <a href={placesAdd.osmCopyright}>{placesAdd.osmCredit}</a>
        </p>
      )}
      {hasEntries && phase !== 'done' && phase !== 'offer' && (
        <div className="place-paste-savebar">
          <button
            type="button"
            className="btn primary"
            id="paste-save"
            disabled={!ready || running || saving || busyIds.size > 0 || held}
            onClick={save}
          >
            {saving
              ? words.saving
              : outings
                ? ready
                  ? ow.addN(ready)
                  : ow.add
                : ready
                  ? words.saveN(ready)
                  : words.save}
          </button>
          <p>{saveNote}</p>
        </div>
      )}
      {written.length > 0 && (
        <section className="panel" aria-labelledby="paste-added-h">
          <div className="panel-head">
            <h2 id="paste-added-h">{placesAdd.addedHeading}</h2>
            <span className="spots-pill">{written.length}</span>
          </div>
          <ul className="place-added">
            {(showAll.added ? written : written.slice(0, cap)).map((spot) => (
              <li key={spot.id}>
                <span>
                  <b>{spot.name}</b>
                  {spot.address && (
                    <>
                      {' '}
                      <span className="muted">{spot.address}</span>
                    </>
                  )}
                </span>
                <span className="place-saved-mark">
                  {spot.isPublic
                    ? placesAdd.savedPublic
                    : placesAdd.savedPrivate}
                </span>
              </li>
            ))}
          </ul>
          {written.length > cap && (
            <div className="panel-body">
              <button
                type="button"
                className="chip capped-toggle"
                aria-expanded={Boolean(showAll.added)}
                onClick={() =>
                  setShowAll((old) => ({ ...old, added: !old.added }))
                }
              >
                {showAll.added
                  ? words.showFewer
                  : words.showAll(written.length)}
                <span className="visually-hidden">
                  {' '}
                  {placesAdd.addedHeading.toLowerCase()}
                </span>
              </button>
            </div>
          )}
        </section>
      )}
    </>
  )
}
