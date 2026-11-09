import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import SpotCard, { SpotTags } from '../components/SpotCard.jsx'
import SpotMap from '../components/SpotMap.jsx'
import { TAGS, denver, tagLabel } from '../content/denver.js'
import { denverMap } from '../content/maps/denver.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { placeSpots } from '../lib/mapFit.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

const copy = denver.page

/** Below this width the map and list stack under a Map / List toggle. */
export const PHONE = '(max-width: 760px)'

/**
 * The pressed tags from `?tag=park,kid-ok`: known tags only, each once, in
 * the vocabulary's order, so a hand-edited or stale link cannot press a chip
 * that does not exist.
 *
 * @param {string|null} param The query value.
 * @returns {string[]}
 */
export function parseTags(param) {
  const asked = new Set((param ?? '').split(','))
  return TAGS.filter((tag) => asked.has(tag))
}

/**
 * The spots carrying every pressed tag (AND), in the order given.
 *
 * @param {{tags: string[]}[]} spots
 * @param {string[]} tags The pressed tags; none keeps every spot.
 */
export function filterSpots(spots, tags) {
  return spots.filter((spot) => tags.every((tag) => spot.tags.includes(tag)))
}

/**
 * Each tag's count over the unfiltered list, in vocabulary order. A tag the
 * spots carry that this build does not know is left out: it could not be
 * pressed (`parseTags`).
 *
 * @param {{tags: string[]}[]} spots
 * @returns {{tag: string, count: number}[]}
 */
export function tagCounts(spots) {
  return TAGS.map((tag) => ({
    tag,
    count: spots.filter((spot) => spot.tags.includes(tag)).length,
  }))
}

/**
 * The tag chips: All plus one chip per tag, multi-select and AND-combined.
 * A chip with no spots behind it is hidden unless pressed, and the row is
 * left out when it would offer at most one tag and none is pressed (the
 * `FilterChips` rule). All is pressed when no tag is, and clears the rest.
 */
function TagChips({ counts, total, pressed, onChange }) {
  const shown = counts.filter(
    ({ tag, count }) => count > 0 || pressed.includes(tag),
  )
  if (shown.length <= 1 && pressed.length === 0) return null
  const toggle = (tag) =>
    onChange(
      pressed.includes(tag)
        ? pressed.filter((t) => t !== tag)
        : TAGS.filter((t) => t === tag || pressed.includes(t)),
    )
  return (
    <div
      className="chip-row denver-chips"
      role="group"
      aria-label={copy.tagsLabel}
    >
      <button
        type="button"
        className="chip"
        aria-pressed={pressed.length === 0}
        onClick={() => onChange([])}
      >
        {copy.all} <span className="chip-count">{total}</span>
      </button>
      {shown.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className="chip"
          aria-pressed={pressed.includes(tag)}
          onClick={() => toggle(tag)}
        >
          {tagLabel(tag)} <span className="chip-count">{count}</span>
        </button>
      ))}
    </div>
  )
}

/** The popover at a selected pin: name, neighbourhood and tags, no distance. */
function Popover({ spot }) {
  return (
    <>
      <b className="spot-popover-name">{spot.name}</b>
      {spot.neighbourhood ? (
        <span className="spot-popover-area">{spot.neighbourhood}</span>
      ) : null}
      <SpotTags tags={spot.tags} />
    </>
  )
}

/**
 * Denver, the short list: public spots on a drawn map beside the list
 * (spec: docs/planning/2026-11-08-denver-spots-design.md, Surface 1).
 *
 * The list is the page; the map is a second view of it. Tag chips filter
 * both at once and are mirrored to `?tag=` so a filtered view can be shared.
 * Selecting a pin scrolls its card into view and marks it, selecting a card
 * marks its pin, and Escape clears either. On a phone the two stack under
 * a Map / List toggle, List first. The map never re-fits: pins appear and
 * disappear, and a spot outside the drawing is marked off the map in the
 * list instead of being pinned.
 */
export default function Denver() {
  usePageTitle(`${copy.title} · Joey Haas`)
  const { data, failed } = useSnapshotThenLive('spots')
  const [searchParams, setSearchParams] = useSearchParams()
  const tagParam = searchParams.get('tag')
  const pressed = useMemo(() => parseTags(tagParam), [tagParam])
  const [chosen, setChosen] = useState(null)
  const [view, setView] = useState('list')
  const [slow, setSlow] = useState(false)
  const phone = useMediaQuery(PHONE)
  const cards = useRef(new Map())

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const spots = useMemo(
    () =>
      (data ?? []).map((spot) => ({
        ...spot,
        key: spot.spot_id,
        pinLabel: [spot.name, ...spot.tags.map(tagLabel)].join(', '),
      })),
    [data],
  )
  const placed = useMemo(() => placeSpots(denverMap, spots), [spots])
  const visible = useMemo(() => filterSpots(spots, pressed), [spots, pressed])
  // A selection filtered out of view is no selection, and does not come back
  // when the filter is lifted: whenever ?tag= changes (a chip, a link, Back),
  // a selection the new filter hides is dropped.
  const [seenTags, setSeenTags] = useState(tagParam)
  if (seenTags !== tagParam) {
    setSeenTags(tagParam)
    if (!visible.some((spot) => spot.key === chosen)) setChosen(null)
  }
  const selected = visible.some((spot) => spot.key === chosen) ? chosen : null

  // Escape clears from anywhere on the page: Safari and Firefox on macOS do
  // not focus a clicked button, so the key may arrive at the body.
  useEffect(() => {
    if (selected == null) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setChosen(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected])

  function changeTags(next) {
    const params = new URLSearchParams(searchParams)
    if (next.length) params.set('tag', next.join(','))
    else params.delete('tag')
    setSearchParams(params, { replace: true })
  }

  function selectFromMap(key) {
    setChosen(key)
    if (key == null || phone) return
    cards.current
      .get(key)
      ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  if (!data) {
    return (
      <section className="denver-page">
        <h1>{copy.title}</h1>
        <p className="denver-lede">{copy.lede}</p>
        {failed ? (
          <p className="admin-error" role="alert">
            {LOAD_ERROR}
          </p>
        ) : (
          <p className="muted" role="status">
            {slow ? WAKING : 'Loading…'}
          </p>
        )}
      </section>
    )
  }

  const showMap = !phone || view === 'map'
  const showList = !phone || view === 'list'

  return (
    <section className="denver-page">
      <h1>{copy.title}</h1>
      <p className="denver-lede">{copy.lede}</p>
      <TagChips
        counts={tagCounts(spots)}
        total={spots.length}
        pressed={pressed}
        onChange={changeTags}
      />
      {phone ? (
        <div className="denver-view" role="group" aria-label={copy.viewLabel}>
          {['list', 'map'].map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {copy.views[value]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="denver-layout">
        {showMap ? (
          <div className="denver-map">
            <SpotMap
              drawing={denverMap}
              spots={visible}
              selected={selected}
              onSelect={selectFromMap}
              label={copy.mapLabel(
                visible.filter((spot) => !placed.get(spot.key).offMap).length,
              )}
              title={copy.mapTitle}
              renderPopover={(spot) => <Popover spot={spot} />}
            />
          </div>
        ) : null}
        {showList ? (
          <div className="denver-list">
            <p className="denver-list-head">
              <span className="denver-list-count">
                {copy.count(visible.length)}
              </span>{' '}
              <span className="muted">· {copy.sorted}</span>
            </p>
            {spots.length === 0 ? (
              <p className="muted">{copy.empty}</p>
            ) : visible.length === 0 ? (
              <p className="muted">{copy.noMatch}</p>
            ) : (
              <div className="denver-cards">
                {visible.map((spot) => (
                  <SpotCard
                    key={spot.key}
                    ref={(node) => {
                      if (node) cards.current.set(spot.key, node)
                      else cards.current.delete(spot.key)
                    }}
                    spot={spot}
                    selected={spot.key === selected}
                    offMap={placed.get(spot.key).offMap}
                    onSelect={() =>
                      setChosen(spot.key === selected ? null : spot.key)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
