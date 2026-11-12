import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import NeighbourStrip from '../components/NeighbourStrip.jsx'
import OwnerControls from '../components/OwnerControls.jsx'
import StatePill from '../components/StatePill.jsx'
import { spine } from '../content/spine.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch } from '../lib/api.js'
import { expandRanges } from '../lib/comics.js'
import { formatDate } from '../lib/formatDate.js'
import { editionPath, itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
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
  const [result, setResult] = useState({ state: 'loading', page: null })
  const [stored, setStored] = useState(null)
  const [slow, setSlow] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}/issues/${n}`,
      )
      if (response.status === 404) return { state: 'missing', page: null }
      if (!response.ok) return { state: 'error', page: null }
      return { state: 'ready', page: await response.json() }
    } catch {
      return { state: 'error', page: null }
    }
  }, [id, n])

  const loadStored = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/items/${encodeURIComponent(id)}`)
      return response.ok ? storedView(await response.json()) : null
    } catch {
      return null
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => setSlow(true), 2000)
    load()
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .finally(() => clearTimeout(timer))
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])

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
    const [next, row] = await Promise.all([load(), loadStored()])
    if (next.state === 'ready') setResult(next)
    if (row) setStored(row)
  }, [load, loadStored])

  const page = result.page
  usePageTitle(
    result.state === 'missing'
      ? null
      : page
        ? `${page.series_title} #${n} · ${spine.name}`
        : `${spine.name} · Joey Haas`,
  )

  if (result.state === 'missing') return <NotFound />
  if (result.state === 'loading') {
    return (
      <section>
        <p className="muted" role="status">
          {slow ? WAKING : 'Loading…'}
        </p>
      </section>
    )
  }
  if (result.state === 'error') {
    return (
      <section>
        <p className="admin-error" role="alert">
          {LOAD_ERROR}
        </p>
      </section>
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
  const kicker = [page.series_title, page.publisher].filter(Boolean).join(' · ')

  return (
    <article className="comic-issue">
      <nav aria-label={COPY.breadcrumb} className="comic-issue-crumbs">
        <ol>
          <li>
            <Link to={spine.tabs.comics.to}>{COPY.comics}</Link>
          </li>
          <li>
            <Link to={itemPath(page.series_id)}>{page.series_title}</Link>
          </li>
          <li aria-current="page">#{page.number}</li>
        </ol>
      </nav>

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
          />
        </div>
        <div className="comic-issue-text">
          <p className="item-kicker">{kicker}</p>
          <h1>
            #{page.number}
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
