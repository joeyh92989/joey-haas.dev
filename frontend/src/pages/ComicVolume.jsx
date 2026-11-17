import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import Breadcrumb from '../components/Breadcrumb.jsx'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import LoadState from '../components/LoadState.jsx'
import StatePill from '../components/StatePill.jsx'
import { spine } from '../content/spine.js'
import { SAVED_NOT_REFRESHED } from '../content/status.js'
import { apiFetch } from '../lib/api.js'
import { setMark } from '../lib/comicEdits.js'
import { issuePath, itemPath, volumePath } from '../lib/spinePaths.js'
import { useLiveRead } from '../lib/useLiveRead.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useRefreshAfterWrite } from '../lib/useRefreshAfterWrite.js'
import { adminVolumePath } from '../lib/volumeEdits.js'
import NotFound from './NotFound.jsx'

const COPY = spine.comics.volume
const ISSUE = spine.comics.issue
// A title with no Comic Vine page of its own still credits the site.
const COMIC_VINE_HOME = 'https://comicvine.gamespot.com/'

/**
 * The owner's buttons: Read to the end (when the book has a linked range on
 * this title) and the way to edit, which opens the book's admin page.
 */
function OwnerBox({ id, slug, range, read, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function readToEnd() {
    setBusy(true)
    setError(null)
    try {
      await setMark(id, range.from_number, 'read', range.to_number)
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
        {range && (
          <button
            type="button"
            className="btn sm"
            disabled={busy || read}
            onClick={readToEnd}
          >
            {read ? COPY.owner.readDone : COPY.owner.readToEnd}
          </button>
        )}
        <Link className="btn sm" to={adminVolumePath(id, slug)}>
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
function Neighbour({ side, id, book }) {
  return (
    <Link
      className={`edition-neighbour ${side}`}
      to={volumePath(id, book.slug)}
    >
      <span className="tiny">
        {side === 'prev' ? COPY.previous : COPY.next}
      </span>
      <strong>{book.label}</strong>
      {book.line_number != null && (
        <span className="tiny">{COPY.number(book.line_number)}</span>
      )}
    </Link>
  )
}

/** One collects entry, as written; a link only when the entry has one. */
function CollectEntry({ entry }) {
  const text = entry.issue_text
  return (
    <li>
      <span>{entry.series_name}</span>{' '}
      {entry.link ? (
        <Link to={issuePath(entry.link.item_id, entry.link.from_number)}>
          {text}
        </Link>
      ) : (
        <span>{text}</span>
      )}
    </li>
  )
}

/**
 * The public page for one book: /shelf/<id>/<slug>/, where the slug is
 * `vol-<n>` or the `ed-<from>-<to>` an old edition URL carries. What it is
 * (cover, format, number in its line, pages, ISBN, description) and what it
 * collects, then the books either side of it in the title.
 *
 * @param {object} props
 * @param {string} props.id - The title's item id.
 * @param {string} props.slug - The volume's slug.
 */
export default function ComicVolume({ id, slug }) {
  const { signedIn = false } = useOutletContext() ?? {}
  const read = useLiveRead(
    async (signal) => {
      const response = await apiFetch(
        `/api/public/items/${encodeURIComponent(id)}/volumes/${encodeURIComponent(slug)}`,
        { signal },
      )
      if (response.status === 404) return { missing: true }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    [id, slug],
  )
  const { failed, retry } = read
  const { refresh, tryAgain, afterWrite } = useRefreshAfterWrite(retry)
  const missing = read.data?.missing === true
  const page = missing ? null : read.data

  usePageTitle(
    missing
      ? null
      : page
        ? `${COPY.title(page.title.title, page.volume.label)} · ${spine.name}`
        : `${spine.name} · Joey Haas`,
  )

  if (missing) return <NotFound />

  if (!page) {
    return (
      <article className="comic-issue comic-volume">
        <Breadcrumb
          label={ISSUE.breadcrumb}
          trail={[
            { label: spine.name, to: spine.path },
            { label: ISSUE.comics, to: spine.tabs.comics.to },
            { label: ISSUE.series, to: itemPath(id) },
            { label: COPY.fallbackTitle },
          ]}
        />
        <h1>{COPY.fallbackTitle}</h1>
        <LoadState loading={!failed} failed={failed} onRetry={retry} />
      </article>
    )
  }

  const { title, volume, collects, prev, next } = page
  const cover = volume.large_url || volume.cover_url
  // Read to the end acts on the first collected range on this very title.
  const range =
    collects.find((entry) => entry.link?.item_id === title.id)?.link ?? null

  return (
    <article className="comic-issue comic-volume">
      <Breadcrumb
        label={ISSUE.breadcrumb}
        trail={[
          { label: spine.name, to: spine.path },
          { label: ISSUE.comics, to: spine.tabs.comics.to },
          { label: title.title, to: itemPath(title.id) },
          { label: volume.label },
        ]}
      />

      <LoadState
        failed={failed}
        stale
        live={read.live}
        staleMessage={afterWrite ? SAVED_NOT_REFRESHED : undefined}
        onRetry={tryAgain}
      />

      <div className="comic-issue-main">
        <div className="comic-issue-cover book-tile">
          <CoverImage
            src={cover}
            type="comic"
            alt={COPY.coverAlt(title.title, volume.label)}
            priority
          />
        </div>
        <div className="comic-issue-text">
          <h1>{volume.label}</h1>
          <p className="comic-issue-pills">
            <StatePill state={volume.read ? 'read' : 'owned'} />
          </p>

          <dl className="comic-issue-facts">
            <dt>{COPY.facts.format}</dt>
            <dd>{COPY.kinds[volume.kind] ?? volume.kind}</dd>
            {volume.line_number != null && (
              <>
                <dt>{COPY.facts.number}</dt>
                <dd>{COPY.number(volume.line_number)}</dd>
              </>
            )}
            {volume.pages != null && (
              <>
                <dt>{COPY.facts.pages}</dt>
                <dd>{volume.pages}</dd>
              </>
            )}
            {volume.isbn && (
              <>
                <dt>{COPY.facts.isbn}</dt>
                <dd>{volume.isbn}</dd>
              </>
            )}
          </dl>

          <ComicDescription
            paragraphs={volume.description}
            sourceUrl={page.source_url ?? COMIC_VINE_HOME}
            cover={Boolean(cover)}
          />

          {signedIn && (
            <OwnerBox
              id={id}
              slug={slug}
              range={range}
              read={volume.read}
              onChanged={refresh}
            />
          )}

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

      <h2 className="edition-inside-title" id="volume-collects">
        {COPY.collects}
      </h2>
      {collects.length ? (
        <ol className="volume-collects" aria-labelledby="volume-collects">
          {collects.map((entry, index) => (
            <CollectEntry key={index} entry={entry} />
          ))}
        </ol>
      ) : (
        <p className="muted">{COPY.collectsEmpty}</p>
      )}

      <nav aria-label={COPY.neighbours} className="edition-neighbours">
        {prev ? (
          <Neighbour side="prev" id={title.id} book={prev} />
        ) : (
          <p className="tiny">{COPY.first}</p>
        )}
        {next ? (
          <Neighbour side="next" id={title.id} book={next} />
        ) : (
          <p className="tiny">{COPY.last}</p>
        )}
      </nav>
    </article>
  )
}
