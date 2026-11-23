import { useState } from 'react'
import { Link } from 'react-router'
import { apiFetch, errorMessage } from '../../lib/api.js'
import { adminCopy } from '../../content/adminCopy.js'
import { comicIntake as words } from '../../content/comicIntake.js'
import { seedIntake } from '../../content/seedIntake.js'
import { hashRanges } from '../../lib/comicBooks.js'
import { runModel } from '../../lib/comicRun.js'
import { shelfPath } from '../../lib/intake.js'
import { itemPath } from '../../lib/spinePaths.js'
import StatTile, { StatTiles } from '../StatTile.jsx'
import SeriesGrewRow from './SeriesGrewRow.jsx'
import { ibtn } from '../addClasses.js'
import {
  INTAKE_ACTIONS,
  INTAKE_ADDS,
  INTAKE_ADDS_TITLE,
  INTAKE_ADDS_WHAT,
  INTAKE_DONE_MADE,
  INTAKE_GROW_LIST,
  INTAKE_SKIM_HEAD,
  INTAKE_STEP,
} from '../intakeClasses.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One `series_grew` report as the row's growth: before, after, the split. */
export function reportGrowth(grew) {
  const { before } = grew
  return {
    before: {
      held: before.owned,
      released: before.released,
      ongoing: grew.ongoing,
    },
    after: runModel({
      singles: grew.after_owned_text,
      released: before.released,
      ongoing: grew.ongoing,
    }),
    added: grew.added,
    already: grew.already,
  }
}

/**
 * Sitting step 4: what the commit did, in the commit's own figures (AC 8):
 * added, already on the shelf, skipped and kept, photos that read
 * nothing, and the issues added to comic series already on the shelf
 * (a series is one row, so a new issue of one is not a new item): from
 * `series_grew`, a "series grew" and an "already owned" tile and the
 * "Series that grew" list, each title linking to its series page (its
 * admin page while it is private: the public page would not find it). Then
 * Shoot the next box, Publish these N (shelf kinds only: new rows are
 * private) and See them on the shelf.
 *
 * @param {object} props
 * @param {{added: number, already_owned: number, issues_added?: number,
 *   series_grew?: object[], skipped_kept: number, photos_empty: number,
 *   photos_waiting: number, created?: string[]}}
 *   props.answer The commit's answer.
 * @param {object} props.sitting The sitting as it was committed.
 * @param {() => void} props.onNextBox
 * @param {boolean} props.startingNext
 * @param {import('react').Ref<HTMLHeadingElement>} props.headingRef
 */
export default function DoneStep({
  answer,
  sitting,
  onNextBox,
  startingNext,
  headingRef,
}) {
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState(null)
  const closet = sitting.area === 'closet'
  const created = answer.created ?? []
  const canPublish = !closet && created.length > 0 && !published
  const issuesAdded = answer.issues_added ?? 0
  // An answer from before `series_grew` existed says it in one line.
  const report = answer.series_grew ?? null
  const grew = (report ?? []).filter((series) => series.added.length > 0)
  const grewIssues = grew.reduce((sum, series) => sum + series.added.length, 0)
  const alreadyIssues = (report ?? []).reduce(
    (sum, series) => sum + series.already.length,
    0,
  )

  // The books and titles the commit wrote (a collected book is a volume).
  const volumes = answer.volumes_new ?? []
  const titles = answer.titles_created ?? []
  const madeLine = [
    volumes.length ? words.doneBookCount(volumes.length) : null,
    titles.length ? words.doneTitleCount(titles.length) : null,
  ]
    .filter(Boolean)
    .join(', ')

  // "<Series> · adds #1–4" for a series the sitting created, and the
  // typed books a series already on the shelf gained.
  const bookParts = (books) => (books ?? []).map(words.addsEdition)
  const addedLines = [
    ...(answer.series_new ?? []).map((series) => ({
      key: series.external_id
        ? `new-${series.external_source}:${series.external_id}`
        : `new-${series.title}`,
      title: series.title,
      parts: [
        series.issues.length ? words.adds(hashRanges(series.issues)) : null,
        ...bookParts(series.books),
      ].filter(Boolean),
    })),
    ...(report ?? [])
      .filter((series) => series.books_added?.length)
      .map((series) => ({
        key: `grew-${series.item_id}`,
        title: series.title,
        parts: bookParts(series.books_added),
      })),
  ]

  // A seed file's counts, the ones that happened (Done says nothing of 0).
  const file = answer.file_import ?? null
  const fileTiles = [
    [seedIntake.done.skippedNotOwned, file?.skipped_not_owned],
    [seedIntake.done.skippedKnown, file?.skipped_known_not_owned],
    [seedIntake.done.alreadyImported, file?.already_imported],
    [seedIntake.done.duplicates, file?.duplicates],
    [seedIntake.done.unreadable, file?.unreadable],
    [seedIntake.done.withoutPhoto, file ? answer.images_missing : 0],
  ].filter(([, value]) => value > 0)

  async function publish() {
    setPublishing(true)
    setError(null)
    try {
      const response = await apiFetch('/api/items/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: true, ids: created }),
      })
      if (!response.ok) setError(await errorMessage(response))
      else setPublished(true)
    } catch {
      setError('The server did not answer; try again.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <section
      className={`intake-step ${INTAKE_STEP}`}
      aria-labelledby="intake-step-heading"
    >
      <h2 id="intake-step-heading" ref={headingRef} tabIndex={-1}>
        Done
      </h2>
      <StatTiles label="What was added">
        <StatTile
          label={closet ? 'added' : 'added, private'}
          value={answer.added}
        />
        <StatTile
          label={closet ? 'already in the closet' : 'already on the shelf'}
          value={answer.already_owned}
        />
        <StatTile
          label="skipped, kept as drafts"
          value={answer.skipped_kept}
          detail={
            answer.photos_waiting
              ? `${answer.photos_waiting} photos still waiting to be read`
              : null
          }
        />
        <StatTile
          label="photos that read nothing"
          value={answer.photos_empty}
        />
        {fileTiles.map(([label, value]) => (
          <StatTile key={label} label={label} value={value} />
        ))}
        {grew.length > 0 && (
          <StatTile
            label="series grew"
            value={grew.length}
            detail={plural(grewIssues, 'issue')}
          />
        )}
        {alreadyIssues > 0 && (
          <StatTile
            label={
              alreadyIssues === 1
                ? 'issue already owned'
                : 'issues already owned'
            }
            value={alreadyIssues}
          />
        )}
      </StatTiles>
      {madeLine && (
        <p className={`intake-done-made ${INTAKE_DONE_MADE}`}>{madeLine}</p>
      )}
      {volumes.length > 0 && (
        <>
          <h3
            className={`kicker intake-skim-head ${INTAKE_SKIM_HEAD}`}
            id="intake-done-books"
          >
            {words.doneBooksHead}
          </h3>
          <ul
            className={`intake-adds ${INTAKE_ADDS}`}
            aria-labelledby="intake-done-books"
          >
            {volumes.map((volume) => (
              <li key={volume.id}>
                <p className={`intake-adds-title ${INTAKE_ADDS_TITLE}`}>
                  <Link
                    to={`/admin/shelf/comics/${volume.title_id}/${volume.slug}`}
                  >
                    {volume.label}
                  </Link>
                </p>
                <p className={`intake-adds-what ${INTAKE_ADDS_WHAT} muted`}>
                  {[
                    volume.line_number != null
                      ? words.doneLineNumber(volume.line_number)
                      : null,
                    volume.title,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {titles.length > 0 && (
        <>
          <h3
            className={`kicker intake-skim-head ${INTAKE_SKIM_HEAD}`}
            id="intake-done-titles"
          >
            {words.doneTitlesHead}
          </h3>
          <ul
            className={`intake-adds ${INTAKE_ADDS}`}
            aria-labelledby="intake-done-titles"
          >
            {titles.map((title) => (
              <li key={title.id}>
                <p className={`intake-adds-title ${INTAKE_ADDS_TITLE}`}>
                  <Link to={`/admin/shelf/comics/${title.id}`}>
                    {title.title}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {grew.length > 0 && (
        <>
          <h3 className={`kicker intake-skim-head ${INTAKE_SKIM_HEAD}`}>
            Series that grew
          </h3>
          <ul className={`intake-grow-list ${INTAKE_GROW_LIST}`}>
            {grew.map((series) => (
              <SeriesGrewRow
                key={series.item_id}
                title={series.title}
                coverUrl={series.cover_url ?? null}
                to={
                  series.is_public === false
                    ? `/admin/shelf/comics/${series.item_id}`
                    : itemPath(series.item_id)
                }
                growth={reportGrowth(series)}
              />
            ))}
          </ul>
        </>
      )}
      {addedLines.length > 0 && (
        <>
          <h3 className={`kicker intake-skim-head ${INTAKE_SKIM_HEAD}`}>
            {words.doneHead}
          </h3>
          <ul className={`intake-adds ${INTAKE_ADDS}`}>
            {addedLines.map((line) => (
              <li key={line.key}>
                <p className={`intake-adds-what ${INTAKE_ADDS_WHAT}`}>
                  {words.doneLine(line.title, line.parts.join(', '))}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {report === null && issuesAdded > 0 && (
        <p>
          {`Added ${issuesAdded} ${issuesAdded === 1 ? 'issue' : 'issues'} to series already on the shelf.`}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!closet && created.length > 0 && !published && (
        <p className="muted">{adminCopy.publish.privateNote}</p>
      )}
      {published && (
        <p role="status">
          Published {created.length}.{' '}
          {sitting.kind === 'comic' || sitting.kind === null
            ? 'Comics show publicly once the next nightly build adds them.'
            : adminCopy.publish.delay}
        </p>
      )}
      <div className={`intake-actions ${INTAKE_ACTIONS}`}>
        {canPublish && (
          <button
            type="button"
            className={ibtn('primary')}
            disabled={publishing}
            onClick={publish}
          >
            {`Publish these ${created.length}`}
          </button>
        )}
        <button
          type="button"
          className={ibtn(canPublish ? 'plain' : 'primary')}
          disabled={startingNext}
          onClick={onNextBox}
        >
          {closet ? 'Shoot the next rack' : 'Shoot the next box'}
        </button>
        <Link
          className={ibtn('plain')}
          to={shelfPath(sitting.area, sitting.kind)}
          state={closet ? { closetStatus: 'untagged' } : undefined}
        >
          {closet ? 'See them in the closet' : 'See them on the shelf'}
        </Link>
      </div>
    </section>
  )
}
