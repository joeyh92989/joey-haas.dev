import { useCallback, useEffect, useState } from 'react'
import { PHONE_TAP } from '../components/sharedClasses.js'
import { Link, useOutletContext } from 'react-router'
import ComicDescription from '../components/ComicDescription.jsx'
import CoverImage from '../components/CoverImage.jsx'
import Breadcrumb from '../components/Breadcrumb.jsx'
import LoadState from '../components/LoadState.jsx'
import NeighbourStrip from '../components/NeighbourStrip.jsx'
import OwnerControls from '../components/OwnerControls.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatePill from '../components/StatePill.jsx'
import { buttonVariants } from '../components/ui/button-variants.js'
import {
  FACTS,
  PHONE_TARGET,
  SOURCE_LINE,
  PAGE_WRAP,
} from '../components/detail-classes.js'
import { cx } from '../lib/cx.js'
import { spine } from '../content/spine.js'
import { apiFetch } from '../lib/api.js'
import { expandRanges } from '../lib/comics.js'
import { formatDate } from '../lib/formatDate.js'
import { volumePath, itemPath } from '../lib/spinePaths.js'
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
 * How the issue is held: a single, books, or both. A book of another title
 * carries that title's name. Nothing when it is neither.
 *
 * @param {object} props
 * @param {boolean} props.single - Held as a single issue.
 * @param {Array<object>} [props.books] - The owned books that collect it.
 */
function AlsoIn({ single, books = [] }) {
  if (!single && books.length === 0) return null
  return (
    <p
      className={cx(
        'comic-issue-held mt-3 mb-0 text-sm [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-[1.5px] [&_a]:underline-offset-4',
        '[&_a]:text-foreground',
      )}
    >
      {single && books.length === 0 && COPY.alsoIn.single}
      {single && books.length > 0 && COPY.alsoIn.both}
      {!single && books.length > 0 && COPY.alsoIn.volumes}
      {books.map((book, i) => (
        <span key={`${book.title_id}/${book.slug}`}>
          {i > 0 && COPY.alsoIn.separator}
          {i === 0 && ' '}
          <Link to={volumePath(book.title_id, book.slug)}>
            {book.same_title
              ? book.label
              : COPY.alsoIn.other(book.label, book.title)}
          </Link>
        </span>
      ))}
    </p>
  )
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
      <article className={cx('comic-issue', PAGE_WRAP)}>
        <Breadcrumb
          label={COPY.breadcrumb}
          trail={[
            { label: spine.name, to: spine.path },
            { label: COPY.comics, to: spine.tabs.comics.to },
            { label: COPY.series, to: itemPath(id) },
            { label: `#${n}` },
          ]}
        />
        <PageHeader title={COPY.fallbackTitle(n)} />
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
  // The one book of this title that holds it: the owner's controls name it.
  const ownTitleBook = page.also_in?.find((book) => book.same_title) ?? null

  return (
    <article className={cx('comic-issue', PAGE_WRAP)}>
      <Breadcrumb
        label={COPY.breadcrumb}
        trail={[
          { label: spine.name, to: spine.path },
          { label: COPY.comics, to: spine.tabs.comics.to },
          { label: page.series_title, to: itemPath(page.series_id) },
          { label: `#${page.number}` },
        ]}
        end={
          signedIn && (
            <Link
              className={cx(
                'crumb-edit',
                PHONE_TAP,
                buttonVariants({ variant: 'outline', size: 'sm' }),
                PHONE_TARGET,
              )}
              to={`/admin/shelf/comics/${encodeURIComponent(page.series_id)}`}
            >
              {COPY.edit}
            </Link>
          )
        }
      />

      <LoadState
        failed={failed}
        stale
        live={read.live}
        staleMessage={afterWrite ? SAVED_NOT_REFRESHED : undefined}
        onRetry={tryAgain}
      />

      <div className="comic-issue-main grid grid-cols-[300px_minmax(0,1fr)] items-start gap-5 max-[640px]:grid-cols-[minmax(0,1fr)]">
        <div className="comic-issue-cover max-[640px]:mx-auto max-[640px]:w-[62%]">
          <CoverImage
            src={page.large_url || page.cover_url}
            type="comic"
            alt={COPY.coverAlt(page.series_title, page.number)}
            priority
            unowned={!held && !upcoming}
            number={page.number}
          />
          {!held && !upcoming && (
            <p className="comic-issue-cover-caption mt-2 mb-0 text-xs text-muted-foreground">
              {COPY.notOwned}
            </p>
          )}
        </div>
        <div className="comic-issue-text">
          <PageHeader
            kicker={kicker || null}
            title={`${page.series_title} #${page.number}${page.name ? ` · ${page.name}` : ''}`}
            className="[&_h1]:mb-2 [&_h1]:[overflow-wrap:anywhere] [&_.kicker]:mb-1"
          />
          <p className="comic-issue-pills m-0 flex flex-wrap gap-2">
            <StatePill state={pill} />
          </p>
          <AlsoIn single={page.held_single} books={page.also_in} />

          <dl className={cx('comic-issue-facts', FACTS)}>
            <dt>{COPY.facts.issue}</dt>
            <dd>{COPY.of(page.number, page.released, page.ongoing)}</dd>
            {page.store_date && (
              <>
                <dt>{COPY.facts.inStores}</dt>
                <dd>{formatDate(page.store_date)}</dd>
              </>
            )}
            <dt>{COPY.facts.read}</dt>
            <dd>{readFact}</dd>
          </dl>

          <ComicDescription
            paragraphs={page.description}
            sourceUrl={page.source_url}
            cover={Boolean(page.large_url || page.cover_url)}
          />

          {signedIn && stored && (
            <OwnerControls
              id={id}
              n={page.number}
              state={page.state}
              stored={stored}
              edition={ownTitleBook}
              onChanged={reload}
            />
          )}

          <p className={cx('comic-issue-attribution mt-4 mb-0', SOURCE_LINE)}>
            {COPY.attribution.before}{' '}
            <a href={page.source_url} rel="noreferrer noopener">
              {COPY.attribution.label}
            </a>
            {COPY.attribution.after}
          </p>
        </div>
      </div>

      <section
        className="issue-neighbours mt-8 border-t border-line-card pt-4"
        aria-labelledby="issue-neighbours"
      >
        <h2
          id="issue-neighbours"
          className="mb-2 font-heading text-lg leading-tight font-medium"
        >
          {COPY.neighbours}
        </h2>
        <NeighbourStrip
          list={page.neighbours}
          current={page.number}
          series={series}
          labelledBy="issue-neighbours"
        />
      </section>
    </article>
  )
}
