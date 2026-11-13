import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import LoadState from '../components/LoadState.jsx'
import NeighbourStrip from '../components/NeighbourStrip.jsx'
import OwnerControls from '../components/OwnerControls.jsx'
import StatePill from '../components/StatePill.jsx'
import { spine } from '../content/spine.js'
import { apiFetch } from '../lib/api.js'
import { expandRanges } from '../lib/comics.js'
import { formatDate } from '../lib/formatDate.js'
import { editionPath, itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useLiveRead } from '../lib/useLiveRead.js'
import { SAVED_NOT_REFRESHED } from '../content/status.js'
import { useRefreshAfterWrite } from '../lib/useRefreshAfterWrite.js'
import NotFound from './NotFound.jsx'

const COPY = spine.comics.issue

/** The owner's row as the controls read it: ranges expanded to sets. */
function storedView(row) {
  return {
    read_to: row.read_to ?? null,
    ownedSet: new Set(expandRanges(row.issues_owned)),
    skippedSet: new Set(expandRanges(row.issues_skipped)),
  }
}

/**
 * The public page for one issue: /shelf/<id>/<n>/. Cover, facts,
 * description, the neighbour strip and Comic Vine's attribution; the
 * owner's controls appear only when signed in. A skip is private, so the
 * page learns of one only from the owner's own row, fetched only when
 * signed in.
 *
 * @param {object} props
 * @param {string} props.id - The series' item id.
 * @param {number} props.n - The issue number.
 */
export default function ComicIssue({ id, n }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const [stored, setStored] = useState(null)

  // A 404 answers with `{ missing: true }`; any other non-OK answer fails.
  const read = useLiveRead(
    async (signal) => {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}/issues/${n}`,
        { signal },
      )
      if (response.status === 404) return { missing: true }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    [id, n],
  )
  const { failed, retry } = read
  const { refresh, tryAgain, afterWrite } = useRefreshAfterWrite(retry)
  const missing = read.data?.missing === true
  const page = missing ? null : read.data

  const loadStored = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/items/${encodeURIComponent(id)}`)
      return response.ok ? storedView(await response.json()) : null
    } catch {
      return null
    }
  }, [id])

  useEffect(() => {
    if (!signedIn) return undefined
    let cancelled = false
    loadStored().then((next) => {
      if (!cancelled) setStored(next)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, loadStored])

  /** After an owner action: the public body and the owner's row again. */
  const reload = useCallback(async () => {
    const [, row] = await Promise.all([refresh(), loadStored()])
    if (row) setStored(row)
  }, [refresh, loadStored])

  usePageTitle(
    missing
      ? null
      : page
        ? `${page.series_title} #${n} · ${spine.name}`
        : `${spine.name} · Joey Haas`,
  )

  if (missing) return <NotFound />

  if (!page) {
    return (
      <article className="comic-issue">
        <Breadcrumb
          label={COPY.breadcrumb}
          trail={[
            { label: spine.name, to: spine.path },
            { label: COPY.comics, to: spine.tabs.comics.to },
            { label: COPY.series, to: itemPath(id) },
            { label: `#${n}` },
          ]}
        />
        <h1>{COPY.fallbackTitle(n)}</h1>
        <LoadState loading={!failed} failed={failed} onRetry={retry} />
      </article>
    )
  }

  const series = { id: page.series_id, title: page.series_title }
  const held = page.state === 'read' || page.state === 'owned'
  // The pill reads "Skipped · private" only for the owner.
  const skipped = signedIn && stored?.skippedSet.has(n)
  const pill = skipped && page.state === 'missing' ? 'skipped' : page.state
  const readFact =
    page.state === 'read'
      ? COPY.read.yes
      : held
        ? COPY.read.notYet
        : COPY.read.none
  // The series is in the trail and the title; the kicker names the publisher.
  const kicker = page.publisher
  const upcoming = page.state === 'not-out'

  return (
    <article className="comic-issue">
      <Breadcrumb
        label={COPY.breadcrumb}
        trail={[
          { label: spine.name, to: spine.path },
          { label: COPY.comics, to: spine.tabs.comics.to },
          { label: page.series_title, to: itemPath(page.series_id) },
          { label: `#${page.number}` },
        ]}
      />

      <LoadState
        failed={failed}
        stale
        live={read.live}
        staleMessage={afterWrite ? SAVED_NOT_REFRESHED : undefined}
        onRetry={tryAgain}
      />

      <NeighbourStrip
        list={page.neighbours}
        current={page.number}
        series={series}
      />

      <div className="comic-issue-main">
        <div className="comic-issue-cover">
          <CoverImage
            src={page.large_url || page.cover_url}
            type="comic"
            alt={COPY.coverAlt(page.series_title, page.number)}
            priority
            unowned={!held && !upcoming}
            number={page.number}
          />
          {!held && !upcoming && (
            <p className="comic-issue-cover-caption">{COPY.notOwned}</p>
          )}
        </div>
        <div className="comic-issue-text">
          {kicker && <p className="item-kicker">{kicker}</p>}
          <h1>
            {page.series_title} #{page.number}
            {page.name ? ` · ${page.name}` : ''}
          </h1>
          <p className="comic-issue-pills">
            <StatePill state={pill} />
            {page.edition && (
              <Link
                className="state-pill"
                data-state="book"
                to={editionPath(page.series_id, page.edition.slug)}
              >
                {COPY.inEdition(page.edition.label)}
              </Link>
            )}
          </p>

          <dl className="comic-issue-facts">
            <dt>{COPY.facts.issue}</dt>
            <dd>{COPY.of(page.number, page.released, page.ongoing)}</dd>
            {page.store_date && (
              <>
                <dt>{COPY.facts.inStores}</dt>
                <dd>{formatDate(page.store_date)}</dd>
              </>
            )}
            <dt>{COPY.facts.heldAs}</dt>
            <dd>{page.held_as}</dd>
            <dt>{COPY.facts.read}</dt>
            <dd>{readFact}</dd>
          </dl>

          <ComicDescription paragraphs={page.description} />

          {signedIn && stored && (
            <OwnerControls
              id={id}
              n={page.number}
              stored={stored}
              held={held}
              onChanged={reload}
            />
          )}

          <p className="comic-issue-attribution">
            {COPY.attribution.before}{' '}
            <a href={page.source_url} rel="noreferrer noopener">
              {COPY.attribution.label}
            </a>
            {COPY.attribution.after}
          </p>
        </div>
      </div>
    </article>
  )
}
