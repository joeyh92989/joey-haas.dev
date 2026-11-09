import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import DailyResult from '../components/DailyResult.jsx'
import GuessCombobox from '../components/GuessCombobox.jsx'
import ShareSheet from '../components/ShareSheet.jsx'
import ShelfleBoard from '../components/ShelfleBoard.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { daily } from '../content/daily.js'
import {
  DAILY_EPOCH,
  MAX_GUESSES,
  dailyPool,
  dayNumber,
  dayKicker,
  grade,
  picksThrough,
  shareText,
  shareWords,
} from '../lib/daily.js'
import { DAILY_SALT } from '../lib/dailyConfig.js'
import {
  dayRecord,
  readDaily,
  recordGuess,
  recordOutcome,
  statsFor,
  writeDaily,
} from '../lib/dailyStorage.js'
import { formatDate, ownerDay } from '../lib/formatDate.js'
import { readSnapshot } from '../lib/snapshot.js'
import { itemPath } from '../lib/spinePaths.js'
import { usePageTitle } from '../lib/usePageTitle.js'

const copy = daily
const LEGEND_STATES = ['match', 'close', 'no']

/**
 * /daily, Shelfle (daily puzzle spec): guess the game on the shelf in six,
 * each guess graded on platform, year, genre and size. One answer per
 * Denver calendar day, the same for everyone, picked from the public
 * snapshot in the browser; the page never calls the API, so it plays while
 * the backend sleeps. Streak and today's guesses live in localStorage and
 * the page renders fully without it.
 */
export default function Daily() {
  usePageTitle(copy.headTitle)
  // undefined while the snapshot loads, null when there is none.
  const [items, setItems] = useState(undefined)
  const [today, setToday] = useState(() => ownerDay())
  const [stored, setStored] = useState(() => readDaily())
  const [status, setStatus] = useState('')
  const [sharing, setSharing] = useState(false)
  // True once this visit ends the game, so the result takes focus from the
  // input it replaces; a day restored finished leaves focus alone.
  const [endedHere, setEndedHere] = useState(false)
  // The status line and the focus move belong to one day: a tab that rolls
  // over at Denver midnight starts the new day without the old one's line.
  const [shownDay, setShownDay] = useState(today)
  if (shownDay !== today) {
    setShownDay(today)
    setStatus('')
    setEndedHere(false)
  }

  useEffect(() => {
    let cancelled = false
    readSnapshot('items').then((data) => {
      if (!cancelled) setItems(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // A tab left open past Denver midnight rolls over when it is looked at,
  // and re-reads storage, which another tab may have played meanwhile:
  // writing this tab's copy back would undo that tab's day.
  useEffect(() => {
    const refresh = () => {
      setToday(ownerDay())
      setStored(readDaily())
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const pool = useMemo(() => dailyPool(items ?? []), [items])
  const byId = useMemo(
    () => new Map(pool.map((item) => [item.id, item])),
    [pool],
  )
  const picks = useMemo(
    () => picksThrough(today, pool, DAILY_SALT),
    [today, pool],
  )
  const pick = picks.at(-1) ?? null
  const yesterday = picks.at(-2) ?? null

  const record = pick ? dayRecord(stored, pick.day) : { guesses: [], won: null }
  const guessed = record.guesses
    .map((id) => byId.get(id))
    .filter((item) => item !== undefined)
  const rows = pick
    ? guessed.map((item) => ({
        title: item.title,
        grades: grade(item, pick.item),
      }))
    : []
  const won =
    record.won === true ||
    (pick !== null && guessed.some((item) => item.id === pick.item.id))
  // A recorded outcome ends the day even if a guessed game has since left
  // the pool and its row with it.
  const over = won || record.won !== null || rows.length >= MAX_GUESSES
  const stats = statsFor(stored)

  function submit(item) {
    let next = recordGuess(stored, pick.day, item.id)
    const made = dayRecord(next, pick.day).guesses.length
    const solved = item.id === pick.item.id
    if (solved || made >= MAX_GUESSES) {
      next = recordOutcome(next, pick.day, solved)
      setEndedHere(true)
      setStatus(
        solved ? copy.announce.won(made) : copy.announce.lost(pick.item.title),
      )
    } else {
      setStatus(copy.announce.graded(made, item.title))
    }
    setStored(next)
    writeDaily(next)
  }

  const grades = rows.map((row) => row.grades)

  return (
    <section className="daily">
      <SpineHeader asLink />
      <div className="daily-head">
        <h1>{copy.name}</h1>
        {pick && (
          <span className="kicker">{dayKicker(pick.day, pick.isoDay)}</span>
        )}
      </div>
      <p className="daily-lede">{copy.lede}</p>

      {items === undefined ? null : dayNumber(today) < 1 ? (
        <p className="muted">{copy.soon(formatDate(DAILY_EPOCH))}</p>
      ) : pick === null ? (
        <p className="muted">{copy.empty}</p>
      ) : (
        <>
          {stats && (
            <p className="daily-stats">
              <span>
                {copy.stats.streak} <b>{stats.streak}</b>
              </span>
              <span>
                {copy.stats.played} <b>{stats.played}</b>
              </span>
              <span>
                {copy.stats.average} <b>{stats.average ?? '—'}</b>
              </span>
            </p>
          )}

          <div className="daily-card">
            {rows.length === 0 && (
              <p className="daily-hint muted">{copy.hint}</p>
            )}
            <ShelfleBoard rows={rows} />
            <p className="daily-legend">
              {LEGEND_STATES.map((state) => (
                <span key={state}>
                  <i data-state={state} aria-hidden="true" />
                  {copy.legend[state]}
                </span>
              ))}
            </p>
            {!over && (
              <GuessCombobox
                pool={pool}
                excludedIds={record.guesses}
                guessNumber={rows.length + 1}
                disabled={over}
                onSubmit={submit}
                onReject={(already) =>
                  setStatus(
                    already
                      ? copy.input.alreadyGuessed(already.title)
                      : copy.input.notOnShelf,
                  )
                }
              />
            )}
            <p className="daily-status muted" role="status" aria-live="polite">
              {status}
            </p>
            {over && (
              <DailyResult
                answer={pick.item}
                won={won}
                guesses={rows.length}
                onShare={() => setSharing(true)}
                focusOnMount={endedHere}
              />
            )}
            {yesterday && (
              <p className="daily-yesterday">
                {copy.yesterday}{' '}
                <b>
                  <Link to={itemPath(yesterday.item.id)}>
                    {yesterday.item.title}
                  </Link>
                </b>
              </p>
            )}
          </div>

          <ShareSheet
            open={sharing}
            onClose={() => setSharing(false)}
            text={shareText(pick.day, grades, won)}
            words={shareWords(grades)}
            onStatus={setStatus}
          />
        </>
      )}
    </section>
  )
}
