import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import LoadState from '../components/LoadState.jsx'
import FilterChips from '../components/FilterChips.jsx'
import LogOutingSheet from '../components/LogOutingSheet.jsx'
import Sheet from '../components/Sheet.jsx'
import { tagLabel } from '../content/denver.js'
import { history, outings as sheetCopy } from '../content/outings.js'
import { apiFetch } from '../lib/api.js'
import { cityLabel } from '../lib/cities.js'
import {
  activeCount,
  applyFilters,
  filterOptions,
  filteredYearCounts,
  NO_FILTERS,
  parseFilters,
  placeName,
  writeFilters,
} from '../lib/historyFilters.js'
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

/** The verdict's shape for a chip; the word always follows it. */
function Mark({ verdict }) {
  return <span className={`vmark vmark-${verdict}`} aria-hidden="true" />
}

/** The filters that are on, as chips: [{key, node, name}]. */
function activeChips(filters, rows) {
  const chips = []
  if (filters.spot)
    chips.push({
      key: 'spot',
      name: history.chipPlace(
        placeName(rows, filters.spot) ?? history.thisPlace,
      ),
    })
  if (filters.city)
    chips.push({
      key: 'city',
      name: history.chipCity(cityLabel(filters.city)),
    })
  if (filters.tag)
    chips.push({ key: 'tag', name: history.chipTag(tagLabel(filters.tag)) })
  if (filters.verdict)
    chips.push({
      key: 'verdict',
      name: history.chipVerdict(VERDICT_WORDS[filters.verdict]),
      node: (
        <>
          <Mark verdict={filters.verdict} /> {VERDICT_WORDS[filters.verdict]}
        </>
      ),
    })
  if (filters.kid) chips.push({ key: 'kid', name: history.kid })
  return chips.map((chip) => ({ ...chip, node: chip.node ?? chip.name }))
}

/** A filter that is on, with an x that takes it off. */
function ActiveChip({ chip, onRemove }) {
  return (
    <button
      type="button"
      className="chip chip-on"
      aria-label={history.removeFilter(chip.name)}
      onClick={() => onRemove(chip.key)}
    >
      <span>{chip.node}</span>
      <span className="chip-x" aria-hidden="true">
        &times;
      </span>
    </button>
  )
}

/** The sheet's choices: one labelled row each, from what the outings hold. */
function FilterSheet({
  open,
  onClose,
  filters,
  rows,
  options,
  shown,
  onChange,
  onRemove,
}) {
  const titleId = useId()
  const placeId = useId()
  const groups = [
    {
      key: 'city',
      label: history.cityRow,
      options: options.cities,
    },
    {
      key: 'tag',
      label: history.tagRow,
      options: options.tags.map((o) => ({ ...o, label: tagLabel(o.value) })),
    },
    {
      key: 'verdict',
      label: history.verdictRow,
      options: options.verdicts.map((o) => ({
        ...o,
        label: (
          <>
            <Mark verdict={o.value} />
            {VERDICT_WORDS[o.value]}
          </>
        ),
      })),
    },
  ]
  const placeChip = activeChips(filters, rows).find((c) => c.key === 'spot')
  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="history-sheet"
    >
      <div className="history-sheet-head">
        <h2 id={titleId}>{history.filtersLabel}</h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          {history.filtersClose}
        </button>
      </div>
      <div className="history-sheet-body">
        {placeChip && (
          <div className="ctl-row">
            <span className="ctl-label" id={placeId}>
              {history.placeRow}
            </span>
            <div className="chip-row" role="group" aria-labelledby={placeId}>
              <ActiveChip chip={placeChip} onRemove={onRemove} />
            </div>
          </div>
        )}
        <FilterChips
          labelled
          groups={groups}
          value={filters}
          onChange={onChange}
        />
        {(options.kid > 0 || filters.kid) && (
          <FilterChips
            labelled
            groups={[]}
            togglesLabel={history.kidRow}
            toggles={[
              { key: 'kid', label: history.kidFilter, count: options.kid },
            ]}
            value={filters}
            onChange={onChange}
          />
        )}
      </div>
      <div className="history-sheet-foot">
        <button
          type="button"
          className="btn ghost"
          disabled={activeCount(filters) === 0}
          onClick={() => onChange(NO_FILTERS)}
        >
          {history.filtersClear}
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {shown ? history.filtersShow(shown) : history.filtersNone}
        </button>
      </div>
    </Sheet>
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
 * only. Story #348 adds filters (city, tag, verdict, kid along, one place),
 * kept in the URL so a filtered view can be reopened from a link.
 */
export default function AdminHistory() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(null)
  const [ended, setEnded] = useState(false)
  const [reload, setReload] = useState(0)
  const [logging, setLogging] = useState(false)
  const [notice, setNotice] = useState('')
  const [filtering, setFiltering] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const filtersButton = useRef(null)

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

  const rows = useMemo(() => data?.outings ?? [], [data])
  const year = data?.year
  const filters = useMemo(
    () => parseFilters(searchParams, rows),
    [searchParams, rows],
  )
  const filtered = activeCount(filters) > 0
  const matches = useMemo(() => applyFilters(rows, filters), [rows, filters])
  const options = useMemo(() => filterOptions(rows), [rows])
  const chips = useMemo(() => activeChips(filters, rows), [filters, rows])
  const counts = filtered ? filteredYearCounts(matches, year?.year) : null

  function changeFilters(next) {
    setSearchParams(writeFilters(searchParams, next), { replace: true })
  }

  function removeFilter(key) {
    changeFilters({ ...filters, [key]: key === 'kid' ? false : null })
    // The chip that was pressed is gone; with the sheet shut, focus goes to
    // the Filters button (the sheet's own focus handling is Sheet's).
    if (!filtering) filtersButton.current?.focus()
  }
  const openSheet = () => setLogging(true)

  const header = (
    <AdminPageHeader
      title={history.title}
      description={
        data && rows.length > 0
          ? counts
            ? history.filteredCounts(
                year.year,
                counts.outings,
                counts.places,
                counts.loved,
              )
            : history.counts(year.year, year.outings, year.places, year.loved)
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
        onMaybeSaved={() => {
          setNotice('')
          again()
        }}
      />
      <div
        className="history-filters"
        role="group"
        aria-label={history.filtersLabel}
      >
        {rows.length > 0 && (
          <>
            <div className="history-strip">
              <button
                ref={filtersButton}
                type="button"
                className="btn"
                aria-haspopup="dialog"
                onClick={() => setFiltering(true)}
              >
                {history.filtersLabel}
                {filtered && (
                  <>
                    {' '}
                    <span className="history-open-count">{chips.length}</span>
                    <span className="visually-hidden">{history.filtersOn}</span>
                  </>
                )}
              </button>
              {chips.map((chip) => (
                <ActiveChip
                  key={chip.key}
                  chip={chip}
                  onRemove={removeFilter}
                />
              ))}
            </div>
            <p className={filtered ? 'result history-result' : 'result'}>
              <strong aria-live="polite">
                {filtered ? history.result(matches.length, rows.length) : ''}
              </strong>
              {filtered && matches.length > 0 && (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => changeFilters(NO_FILTERS)}
                >
                  {history.filtersClear}
                </button>
              )}
            </p>
            <FilterSheet
              open={filtering}
              onClose={() => setFiltering(false)}
              filters={filters}
              rows={rows}
              options={options}
              shown={matches.length}
              onChange={changeFilters}
              onRemove={removeFilter}
            />
          </>
        )}
      </div>
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
      ) : (
        <>
          {ended && <LoadState ended />}
          {failed && !ended && (
            <LoadState failed stale staleMessage={failed} onRetry={retry} />
          )}
          {rows.length === 0 && (
            <EmptyState
              title={history.emptyTitle}
              line={history.emptyLine}
              action={{ label: sheetCopy.open, onClick: openSheet }}
            />
          )}
          {rows.length > 0 && matches.length === 0 && (
            <EmptyState
              title={history.noMatchTitle}
              line={history.noMatchLine(chips.map((chip) => chip.name))}
              action={{
                label: history.filtersClear,
                onClick: () => changeFilters(NO_FILTERS),
              }}
            />
          )}
          {groupOutings(matches).map((group) => (
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
