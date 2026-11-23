import { useState } from 'react'
import { BOOK_STACK } from '../components/comicClasses.js'
import { Link, useOutletContext } from 'react-router'
import { useCanonicalKey } from '../lib/useCanonicalKey.js'
import { ShelfTrail } from '../components/ShelfByline.jsx'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import LoadState from '../components/LoadState.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatePill from '../components/StatePill.jsx'
import { buttonVariants } from '../components/ui/button-variants.js'
import {
  FACTS,
  OWNER_BOX,
  OWNER_NOTE,
  PHONE_TARGET,
  SIBLING_LINK,
  SOURCE_LINE,
  SUB_HEAD,
  PAGE_WRAP,
} from '../components/detail-classes.js'
import {
  COMIC_VOLUME,
  EDITION_NEIGHBOUR_HOVER,
} from '../components/comicAdminClasses.js'
import { cx } from '../lib/cx.js'
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
// Metron's contents are CC BY-SA 4.0: the credit links the site and the licence.
const METRON_HOME = 'https://metron.cloud/'
const METRON_LICENCE = 'https://creativecommons.org/licenses/by-sa/4.0/'

const SMALL_BUTTON = cx(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  PHONE_TARGET,
)

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
    <div className={cx('comic-issue-owner', OWNER_BOX)}>
      <p className={cx('comic-issue-owner-note', OWNER_NOTE)}>
        {ISSUE.owner.note}
      </p>
      <div className="comic-issue-owner-buttons flex flex-wrap gap-2">
        {range && (
          <button
            type="button"
            className={SMALL_BUTTON}
            disabled={busy || read}
            onClick={readToEnd}
          >
            {read ? COPY.owner.readDone : COPY.owner.readToEnd}
          </button>
        )}
        <Link className={SMALL_BUTTON} to={adminVolumePath(id, slug)}>
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
function Neighbour({ side, title, book }) {
  return (
    <Link
      className={cx(
        'edition-neighbour',
        side,
        SIBLING_LINK,
        EDITION_NEIGHBOUR_HOVER,
        side === 'next' && 'ml-auto text-right',
      )}
      to={volumePath(title, book.slug)}
    >
      <span className="tiny text-xs text-muted-foreground">
        {side === 'prev' ? COPY.previous : COPY.next}
      </span>
      <strong>{book.label}</strong>
      {book.line_number != null && (
        <span className="tiny text-xs text-muted-foreground">
          {COPY.number(book.line_number)}
        </span>
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

  // An old /shelf/<uuid>/<book>/ link becomes the slug form (#479).
  useCanonicalKey(id, page?.title.slug, (key) => volumePath(key, slug))

  if (missing) return <NotFound />

  if (!page) {
    return (
      <article
        className={cx('comic-issue comic-volume', COMIC_VOLUME, PAGE_WRAP)}
      >
        <ShelfTrail
          label={ISSUE.breadcrumb}
          trail={[
            { label: spine.name, to: spine.path },
            { label: ISSUE.comics, to: spine.tabs.comics.to },
            { label: ISSUE.series, to: itemPath(id) },
            { label: COPY.fallbackTitle },
          ]}
        />
        <PageHeader title={COPY.fallbackTitle} />
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
    <article
      className={cx('comic-issue comic-volume', COMIC_VOLUME, PAGE_WRAP)}
    >
      <ShelfTrail
        label={ISSUE.breadcrumb}
        trail={[
          { label: spine.name, to: spine.path },
          { label: ISSUE.comics, to: spine.tabs.comics.to },
          { label: title.title, to: itemPath(title) },
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

      <div className="comic-issue-main grid grid-cols-[300px_minmax(0,1fr)] items-start gap-5 max-[640px]:grid-cols-[minmax(0,1fr)]">
        <div
          className={`comic-issue-cover book-tile ${BOOK_STACK} max-[640px]:mx-auto max-[640px]:w-[62%]`}
        >
          <CoverImage
            src={cover}
            type="comic"
            alt={COPY.coverAlt(title.title, volume.label)}
            priority
          />
        </div>
        <div className="comic-issue-text">
          <PageHeader
            title={volume.label}
            className="[&_h1]:mb-2 [&_h1]:[overflow-wrap:anywhere]"
          />
          <p className="comic-issue-pills m-0 flex flex-wrap gap-2">
            <StatePill state={volume.read ? 'read' : 'owned'} />
          </p>

          <dl className={cx('comic-issue-facts', FACTS)}>
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
              id={title.id}
              slug={slug}
              range={range}
              read={volume.read}
              onChanged={refresh}
            />
          )}

          <p className={cx('comic-issue-attribution mt-4 mb-0', SOURCE_LINE)}>
            {ISSUE.attribution.before}{' '}
            <a
              href={page.source_url || COMIC_VINE_HOME}
              rel="noreferrer noopener"
            >
              {ISSUE.attribution.label}
            </a>
            {ISSUE.attribution.after}
          </p>
          {page.metron_credit && (
            <p className={cx('comic-issue-attribution mt-4 mb-0', SOURCE_LINE)}>
              {COPY.metron.before}{' '}
              <a href={METRON_HOME} rel="noreferrer noopener">
                {COPY.metron.label}
              </a>
              ,{' '}
              <a href={METRON_LICENCE} rel="noreferrer noopener license">
                {COPY.metron.licence}
              </a>
              {COPY.metron.after}
            </p>
          )}
        </div>
      </div>

      <h2 className={cx('edition-inside-title', SUB_HEAD)} id="volume-collects">
        {COPY.collects}
      </h2>
      {collects.length ? (
        <ol
          className="volume-collects m-0 grid list-decimal gap-1 pl-5 [&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-[1.5px] [&_a]:underline-offset-4"
          aria-labelledby="volume-collects"
        >
          {collects.map((entry, index) => (
            <CollectEntry key={index} entry={entry} />
          ))}
        </ol>
      ) : (
        <p className="muted text-muted-foreground">{COPY.collectsEmpty}</p>
      )}

      <nav
        aria-label={COPY.neighbours}
        className="edition-neighbours mt-6 flex flex-wrap justify-between gap-x-4 gap-y-3"
      >
        {prev ? (
          <Neighbour side="prev" title={title} book={prev} />
        ) : (
          <p className="tiny text-xs text-muted-foreground">{COPY.first}</p>
        )}
        {next ? (
          <Neighbour side="next" title={title} book={next} />
        ) : (
          <p className="tiny text-xs text-muted-foreground">{COPY.last}</p>
        )}
      </nav>
    </article>
  )
}
