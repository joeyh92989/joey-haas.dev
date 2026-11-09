import { useEffect, useState } from 'react'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { CATEGORIES, profileBody, profileForm } from '../lib/closet.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COLORING = [
  ['hair', 'Hair'],
  ['skin', 'Skin'],
  ['undertone', 'Undertone'],
]

/**
 * The closet profile, at /admin/closet/profile: what the tagger and (later)
 * the outfit planner read about the person wearing the clothes: sizes,
 * colouring, fit, style words and dislikes, the usual week, when the
 * seasons turn, how soon things may repeat, and how many photos the
 * nightly job may tag. One Save sends the whole form as one PATCH.
 */
export default function AdminClosetProfile() {
  const [form, setForm] = useState(null)
  const [occasions, setOccasions] = useState([])
  const [error, setError] = useState(null)
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let live = true
    const timer = setTimeout(() => setSlow(true), 3000)
    apiFetch('/api/closet/profile')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) {
          setError(
            response.status === 401 || response.status === 403
              ? 'Your session ended. Sign in again.'
              : LOAD_ERROR,
          )
          return
        }
        const body = await response.json()
        if (!live) return
        setOccasions(body.occasions)
        setForm(profileForm(body))
      })
      .catch(() => live && setError(LOAD_ERROR))
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [])

  const set = (key) => (value) => {
    setSaved(false)
    setForm((current) => ({ ...current, [key]: value }))
  }
  const setIn = (key, sub) => (value) =>
    set(key)({ ...form[key], [sub]: value })
  const setDay = (key, day) => (value) =>
    set(key)(form[key].map((v, i) => (i === day ? value : v)))

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await apiFetch('/api/closet/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileBody(form)),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      setForm(profileForm(await response.json()))
      setSaved(true)
    } catch {
      setError('The save did not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <AdminPageHeader
      title="Profile"
      description="what the tagger and the planner know about me"
    />
  )

  if (!form) {
    return (
      <section>
        {header}
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted" role="status">
            {slow ? WAKING : 'Loading…'}
          </p>
        )}
      </section>
    )
  }

  const number = (key, label, min, max, hint) => (
    <label>
      <span className="garment-field-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
      />
      {hint && <span className="muted">{hint}</span>}
    </label>
  )

  return (
    <section className="closet-profile">
      {header}
      <form className="garment-form" onSubmit={save}>
        <fieldset>
          <legend>Sizes</legend>
          {CATEGORIES.map((c) => (
            <label key={c.value}>
              <span className="garment-field-label">{c.plural}</span>
              <input
                type="text"
                maxLength={40}
                value={form.sizes[c.value]}
                onChange={(e) => setIn('sizes', c.value)(e.target.value)}
              />
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Colouring</legend>
          {COLORING.map(([key, label]) => (
            <label key={key}>
              <span className="garment-field-label">{label}</span>
              <input
                type="text"
                maxLength={40}
                value={form.coloring[key]}
                onChange={(e) => setIn('coloring', key)(e.target.value)}
              />
            </label>
          ))}
        </fieldset>

        <label>
          <span className="garment-field-label">Build and fit</span>
          <textarea
            rows={2}
            maxLength={500}
            value={form.build_fit}
            onChange={(e) => set('build_fit')(e.target.value)}
          />
        </label>
        <label>
          <span className="garment-field-label">Style words</span>
          <input
            type="text"
            value={form.style_words}
            placeholder="minimal, workwear, navy"
            onChange={(e) => set('style_words')(e.target.value)}
          />
          <span className="muted">Comma-separated, up to twelve.</span>
        </label>
        <label>
          <span className="garment-field-label">Dislikes</span>
          <input
            type="text"
            value={form.dislikes}
            placeholder="logos, skinny fits"
            onChange={(e) => set('dislikes')(e.target.value)}
          />
          <span className="muted">Comma-separated, up to twelve.</span>
        </label>

        <fieldset className="closet-week">
          <legend>The usual week</legend>
          {DAYS.map((day, i) => (
            <div key={day} className="closet-week-day">
              <span className="garment-field-label">{day}</span>
              <select
                aria-label={`${day} occasion`}
                value={form.weekly_occasions[i]}
                onChange={(e) => setDay('weekly_occasions', i)(e.target.value)}
              >
                {occasions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  aria-label={`${day} bike`}
                  checked={form.weekly_bike[i]}
                  onChange={(e) => setDay('weekly_bike', i)(e.target.checked)}
                />{' '}
                Bike
              </label>
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Seasons turn</legend>
          {[
            ['spring_turn', 'Spring'],
            ['autumn_turn', 'Autumn'],
          ].map(([key, label]) => (
            <label key={key}>
              <span className="garment-field-label">{label}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="04-25"
                pattern="\d{2}-\d{2}"
                value={form[key]}
                onChange={(e) => set(key)(e.target.value)}
              />
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Repeats and tagging</legend>
          {number('repeat_top_days', 'Days before a top repeats', 1, 30)}
          {number(
            'repeat_outfit_weeks',
            'Weeks before an outfit repeats',
            1,
            12,
          )}
          {number(
            'tag_budget',
            'Photos tagged a night',
            0,
            50,
            '0 turns the nightly tagging off.',
          )}
        </fieldset>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="muted" role="status">
            Saved.
          </p>
        )}
        <div className="garment-form-acts">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
