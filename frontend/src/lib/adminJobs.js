import { useEffect, useState } from 'react'
import { SESSION_ENDED } from '../content/status.js'
import { apiFetch } from './api.js'
import { lastNightly, nightlyHeadline, nightlyJobs } from './nightly.js'
import { readSnapshot } from './snapshot.js'

/** The README section that says how to switch the schedule back on. */
export const REENABLE_URL =
  'https://github.com/joeyh92989/joey-haas.dev#nightly-job'

/** The API's state in the header, as a status and its words. */
export const API_WORDS = {
  checking: { state: 'unknown', words: 'Checking the API' },
  awake: { state: 'ok', words: 'API awake' },
  'signed-out': {
    state: 'failed',
    words: SESSION_ENDED,
  },
  error: { state: 'failed', words: 'API error' },
  unreachable: { state: 'failed', words: 'API unreachable' },
}

/** What a status answer says about the API, as a key of API_WORDS. */
function apiState(response) {
  if (response.ok) return 'awake'
  if (response.status === 401 || response.status === 403) return 'signed-out'
  return 'error'
}

/** Radar's and Discover's generate times from the store list, or nulls. */
async function generatedAt(response) {
  const none = { radar: null, discover: null }
  if (!response?.ok) return none
  try {
    const body = await response.json()
    return {
      radar: body?.generated_at?.radar ?? null,
      discover: body?.generated_at?.discover ?? null,
    }
  } catch {
    return none
  }
}

/**
 * The Denver jobs' last runs, `{weather, candidates}`, or null when they
 * cannot be read. Never rejects: the two rows then read unknown.
 */
async function spotsRuns() {
  try {
    const response = await apiFetch('/api/spots/status')
    if (!response.ok) return null
    const body = await response.json()
    return {
      weather: body?.['weather.last_run'] ?? null,
      candidates: body?.['candidates.last_run'] ?? null,
    }
  } catch {
    return null
  }
}

/** The Closet jobs' last runs, or null when they cannot be read. */
async function closetRuns() {
  try {
    const response = await apiFetch('/api/closet/status')
    if (!response.ok) return null
    const body = await response.json()
    return {
      tag: body?.['tag.last_run'] ?? null,
      plan: body?.['plan.last_run'] ?? null,
      opinion: body?.['opinion.last_run'] ?? null,
    }
  } catch {
    return null
  }
}

/** Intake's nightly run, or null when it cannot be read. */
async function intakeRun() {
  try {
    const response = await apiFetch('/api/intake/status')
    if (!response.ok) return null
    const body = await response.json()
    return body?.['nightly.last_run'] ?? null
  } catch {
    return null
  }
}

/** The comic issue sync's last run, or null when it cannot be read. */
async function comicsRun() {
  try {
    const response = await apiFetch('/api/comics/status')
    if (!response.ok) return null
    const body = await response.json()
    return body?.['issues.last_run'] ?? null
  } catch {
    return null
  }
}

/**
 * The catalogue status, the generate times, the Denver, Closet, intake and
 * comic issue jobs' runs and the snapshot's build time.
 * Never rejects. A status that cannot be read leaves `status` null, and the
 * jobs list says so rather than reading as a stopped schedule.
 */
export async function loadNightly() {
  const meta = readSnapshot('meta')
  let api = 'unreachable'
  let status = null
  let generated = { radar: null, discover: null }
  let spots = null
  let closet = null
  let intake = null
  let comics = null
  try {
    const response = await apiFetch('/api/physical/status')
    // Any answer means the server is up; only a failed request is unreachable.
    api = apiState(response)
    if (response.ok) {
      const body = await response.json().catch(() => null)
      // Not a status document: no jobs rather than "may have stopped".
      if (Array.isArray(body?.sources)) {
        status = body
        const [times, runs, closetRun, intakeLast, comicsLast] =
          await Promise.all([
            apiFetch('/api/recommendations/store-list')
              .catch(() => null)
              .then(generatedAt),
            spotsRuns(),
            closetRuns(),
            intakeRun(),
            comicsRun(),
          ])
        generated = times
        spots = runs
        closet = closetRun
        intake = intakeLast
        comics = comicsLast
      }
    }
  } catch {
    // Unreachable API: the header says so; the rest of the page still works.
  }
  return {
    api,
    status,
    generated,
    spots,
    closet,
    intake,
    comics,
    snapshotAt: (await meta)?.fetched_at,
  }
}

/**
 * The nightly state for a page that shows it (Home, Jobs): loaded once per
 * visit, with one clock, so ages agree across renders.
 *
 * @returns {{loaded: boolean, now: number, jobs: ReturnType<typeof nightlyJobs>|null,
 *   headline: ReturnType<typeof nightlyHeadline>|null,
 *   api: {state: string, words: string}}}
 */
export function useNightly() {
  const [nightly, setNightly] = useState(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    loadNightly().then((loaded) => {
      if (live) setNightly(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  const jobs = nightly?.status
    ? nightlyJobs(
        lastNightly(nightly.status, nightly.generated, now),
        nightly.snapshotAt ?? null,
        now,
        nightly.spots,
        nightly.closet,
        nightly.intake,
        nightly.comics,
      )
    : null
  return {
    loaded: nightly !== null,
    now,
    jobs,
    headline: jobs ? nightlyHeadline(jobs) : null,
    api: API_WORDS[nightly?.api ?? 'checking'],
  }
}

/**
 * The jobs in one line for Home's Site card: how many are ok, and the first
 * that is a problem, in the row's own words. A scheduled job (a first run
 * still due) is not a problem.
 *
 * @param {ReturnType<typeof nightlyJobs>} jobs
 * @returns {{state: string, words: string}}
 */
export function jobsSummary(jobs) {
  const ok = jobs.filter((job) => job.state === 'ok').length
  const first =
    jobs.find((job) => job.state === 'failed') ??
    jobs.find((job) => job.state === 'stale') ??
    jobs.find((job) => job.state === 'unknown' && !job.scheduled)
  if (!first) {
    const waiting = jobs.filter((job) => job.scheduled).length
    const tail = waiting ? ` · ${waiting} scheduled` : ''
    return { state: 'ok', words: `${ok} of ${jobs.length} jobs ok${tail}` }
  }
  return {
    state: first.state,
    words: `${ok} of ${jobs.length} jobs ok · ${first.label} ${first.stateWords ?? first.state}`,
  }
}
