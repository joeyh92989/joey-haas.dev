import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import CoverTile from '../components/CoverTile.jsx'
import StatePill from '../components/StatePill.jsx'
import { spine } from '../content/spine.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch } from '../lib/api.js'
import { setReadTo } from '../lib/comicEdits.js'
import { editionPath, issuePath, itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import NotFound from './NotFound.jsx'

const COPY = spine.comics.edition
const ISSUE = spine.comics.issue
// A series with no Comic Vine page of its own still credits the site.
const COMIC_VINE_HOME = 'https://comicvine.gamespot.com/'

/** The owner's buttons: state, Read to the end, and the way to edit. */
function OwnerBox({ id, page, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const done = page.read === 'all'

  async function readToEnd() {
    setBusy(true)
    setError(null)
    try {
      await setReadTo(id, page.to_issue)
      await onChanged()
    } catch (failure) {
      setError(failure?.message || ISSUE.owner.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="comic-issue-owner">
      <p className="comic-issue-owner-note">{ISSUE.owner.note}</p>
      <div className="comic-issue-owner-buttons">
        <span className="state-pill" data-state="owned">
          {COPY.owner.owned}
        </span>
        <button
          type="button"
          className="btn sm"
          disabled={busy || done}
          onClick={readToEnd}
        >
          {done ? COPY.owner.readDone : COPY.owner.readToEnd}
        </button>
        <Link
          className="btn sm"
          to={`/admin/collection/${encodeURIComponent(id)}`}
        >
          {COPY.owner.edit}
        </Link>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** One of the previous/next links under the page. */
function Neighbour({ side, to, name }) {
  return (
    <Link className={`edition-neighbour ${side}`} to={to}>
      <span className="tiny">
        {side === 'prev' ? COPY.previous : COPY.next}
      </span>
      <strong>{name}</strong>
    </Link>
  )
}

/**
 * The public page for one collected edition: /shelf/<id>/ed-<from>-<to>/.
 * It mirrors the issue page, with a strip of the covers inside the book in
 * place of the neighbour strip, and previous/next editions underneath.
 *
 * @param {object} props
 * @param {string} props.id - The series' item id.
 * @param {string} props.slug - `ed-<from>-<to>`.
 */
export default function ComicEdition({ id, slug }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const [result, setResult] = useState({ state: 'loading', page: null })
  const [slow, setSlow] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}/editions/${encodeURIComponent(slug)}`,
      )
      if (response.status === 404) return { state: 'missing', page: null }
      if (!response.ok) return { state: 'error', page: null }
      return { state: 'ready', page: await response.json() }
    } catch {
      return { state: 'error', page: null }
    }
  }, [id, slug])

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

  /** After an owner action: the public body again. */
  const reload = useCallback(async () => {
    const next = await load()
    if (next.state === 'ready') setResult(next)
  }, [load])

  const page = result.page
  usePageTitle(
    result.state === 'missing'
      ? null
      : page
        ? `${COPY.title(page.series_title, page.label)} · ${spine.name}`
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
  const title = COPY.title(page.series_title, page.label)
  const readFact =
    page.read === 'all'
      ? COPY.read.all
      : page.read === 'to'
        ? COPY.read.to(page.read_to)
        : COPY.read.notYet
  const next = page.next
  const nextTo = next?.slug
    ? editionPath(page.series_id, next.slug)
    : next
      ? issuePath(page.series_id, next.number)
      : null

  return (
    <article className="comic-issue comic-edition">
      <nav aria-label={ISSUE.breadcrumb} className="comic-issue-crumbs">
        <ol>
          <li>
            <Link to={spine.tabs.comics.to}>{ISSUE.comics}</Link>
          </li>
          <li>
            <Link to={itemPath(page.series_id)}>{page.series_title}</Link>
          </li>
          <li aria-current="page">{page.label}</li>
        </ol>
      </nav>

      <div className="comic-issue-main">
        <div className="comic-issue-cover book-tile">
          <CoverImage
            src={page.large_url || page.cover_url}
            type="comic"
            alt={COPY.coverAlt(page.series_title, page.label)}
            priority
          />
        </div>
        <div className="comic-issue-text">
          <p className="item-kicker">
            {COPY.kicker(page.kind, page.from_issue, page.to_issue)}
          </p>
          <h1>{title}</h1>
          <p className="comic-issue-pills">
            <StatePill state={page.state} />
          </p>

          <dl className="comic-issue-facts">
            <dt>{COPY.facts.collects}</dt>
            <dd>{COPY.collects(page.from_issue, page.to_issue)}</dd>
            <dt>{COPY.facts.format}</dt>
            <dd>{page.kind}</dd>
            <dt>{COPY.facts.read}</dt>
            <dd>{readFact}</dd>
          </dl>

          <ComicDescription paragraphs={page.description} />

          {signedIn && <OwnerBox id={id} page={page} onChanged={reload} />}

          <p className="comic-issue-attribution">
            {ISSUE.attribution.before}{' '}
            <a
              href={page.source_url || COMIC_VINE_HOME}
              rel="noreferrer noopener"
            >
              {ISSUE.attribution.label}
            </a>
            {ISSUE.attribution.after}
          </p>
        </div>
      </div>

      <h2 className="edition-inside-title">{COPY.inside}</h2>
      <ol className="neighbour-strip inside-strip" aria-label={COPY.inside}>
        {page.inside.map((entry) => (
          <li key={entry.number}>
            <CoverTile
              tile={{
                kind: 'cover',
                n: entry.number,
                cover_url: entry.cover_url,
                store_date: null,
                state: entry.state,
              }}
              size="inside"
              series={series}
            />
          </li>
        ))}
      </ol>

      <nav aria-label={COPY.neighbours} className="edition-neighbours">
        {page.prev ? (
          <Neighbour
            side="prev"
            to={editionPath(page.series_id, page.prev.slug)}
            name={page.prev.label}
          />
        ) : (
          <span />
        )}
        {nextTo && (
          <Neighbour
            side="next"
            to={nextTo}
            name={next.slug ? next.label : `#${next.number}`}
          />
        )}
      </nav>
    </article>
  )
}
