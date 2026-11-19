import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadState from '../components/LoadState.jsx'
import LogOutingSheet from '../components/LogOutingSheet.jsx'
import { history, outings as sheetCopy } from '../content/outings.js'
import { apiFetch } from '../lib/api.js'
import {
  groupOutings,
  headingOf,
  placeLine,
  whenWords,
} from '../lib/outingGroups.js'
import { READ_DEADLINE_MS, withDeadline } from '../lib/waits.js'

/** One read of the history: the outings and the year's counts. */
async function fetchHistory() {
  try {
    const answer = await withDeadline(
      async (signal) => {
        const response = await apiFetch('/api/spots/outings', { signal })
        return response.ok
          ? { data: await response.json() }
          : { status: response.status }
      },
      { ms: READ_DEADLINE_MS },
    )
    if (answer.data) return answer
    if (answer.status === 401 || answer.status === 403) return { ended: true }
    return { error: history.readError }
  } catch {
    return { error: history.readError }
  }
}

const VERDICT_WORDS = Object.fromEntries(sheetCopy.verdicts)

/** The verdict as a shape and a word, never colour alone. */
function Verdict({ verdict }) {
  if (!verdict)
    return (
      <span className="status-text history-verdict history-verdict-none">
        {history.noVerdict}
      </span>
    )
  return (
    <span className={`status-text history-verdict history-verdict-${verdict}`}>
      {VERDICT_WORDS[verdict] ?? verdict}
    </span>
  )
}

function Row({ outing }) {
  const when = whenWords(outing)
  const place = placeLine(outing)
  return (
    <li className="history-row">
      <div className="history-when">
        <span
          className={when.loose ? 'history-when-loose' : 'history-when-day'}
        >
          {when.text}
        </span>
      </div>
      <div className="history-body">
        <p className="history-title">{headingOf(outing)}</p>
        {place && <p className="history-place">{place}</p>}
        {outing.note && (
          <p className="history-note">
            <span className="visually-hidden">{history.privateNote}</span>
            {outing.note}
          </p>
        )}
      </div>
      <div className="history-marks">
        <Verdict verdict={outing.verdict} />
        {outing.kid_along === true && (
          <span className="history-kid">{history.kid}</span>
        )}
      </div>
    </li>
  )
}

/**
 * History (story #347): every logged outing, newest first, grouped by month,
 * each at the precision it was logged with. Private: the read route is admin
 * only. A free filter slot sits under the header for story #348.
 */
export default function AdminHistory() {
  useOutletContext()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(null)
  const [ended, setEnded] = useState(false)
  const [reload, setReload] = useState(0)
  const [logging, setLogging] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    fetchHistory().then((result) => {
      if (!live) return
      if (result.data) {
        setData(result.data)
        setFailed(null)
        setEnded(false)
      } else if (result.ended) {
        setEnded(true)
      } else {
        setFailed(result.error)
      }
    })
    return () => {
      live = false
    }
  }, [reload])

  const again = useCallback(() => setReload((n) => n + 1), [])
  const retry = () => {
    setFailed(null)
    again()
  }

  const rows = data?.outings ?? []
  const year = data?.year
  const openSheet = () => setLogging(true)

  const header = (
    <AdminPageHeader
      title={history.title}
      description={
        data && rows.length > 0
          ? history.counts(year.year, year.outings, year.places, year.loved)
          : undefined
      }
    >
      <button type="button" className="btn primary" onClick={openSheet}>
        {sheetCopy.open}
      </button>
    </AdminPageHeader>
  )

  return (
    <div className="admin-history">
      {header}
      <LogOutingSheet
        open={logging}
        onClose={() => setLogging(false)}
        onSaved={({ spot, created }) => {
          setNotice(sheetCopy.saved(spot.name, created))
          again()
        }}
        onMaybeSaved={again}
      />
      {/* Story #348's filters go here, between the header and the list. */}
      <div className="history-filters" data-slot="filters" />
      <p className="history-saved" role="status">
        {notice}
      </p>
      {!data ? (
        <LoadState
          loading={!failed && !ended}
          failed={!!failed}
          ended={ended}
          message={failed ?? undefined}
          onRetry={retry}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={history.emptyTitle}
          line={history.emptyLine}
          action={{ label: sheetCopy.open, onClick: openSheet }}
        />
      ) : (
        <>
          {failed && (
            <LoadState failed stale staleMessage={failed} onRetry={retry} />
          )}
          {groupOutings(rows).map((group) => (
            <section
              key={group.key}
              className="history-group"
              aria-labelledby={`history-${group.key}`}
            >
              <h2 id={`history-${group.key}`}>
                {group.label}{' '}
                <small>{history.groupCount(group.rows.length)}</small>
              </h2>
              <ul className="history-list">
                {group.rows.map((outing) => (
                  <Row key={outing.id} outing={outing} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
