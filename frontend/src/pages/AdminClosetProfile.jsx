import { useEffect, useState } from 'react'
import { adminCopy } from '../content/adminCopy.js'
import AdminPageHeader from '../components/AdminPageHeader.jsx'
import { LOAD_ERROR, SESSION_ENDED, WAKING } from '../content/status.js'
import { apiFetch, errorMessage } from '../lib/api.js'
import { CATEGORIES, profileBody, profileForm } from '../lib/closet.js'
import { btn, field, textarea } from '../components/closetClasses.js'
import {
  CLOSET_WEEK_DAY,
  GARMENT_FIELD_LABEL,
  GARMENT_FIELDSET,
  GARMENT_FORM,
  GARMENT_FORM_ACTS,
  GARMENT_LABEL,
} from '../components/intakeFormClasses.js'

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
  // The form as loaded or last saved: the switch is sent only when changed.
  const [loaded, setLoaded] = useState(null)
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
              ? SESSION_ENDED
              : LOAD_ERROR,
          )
          return
        }
        const body = await response.json()
        if (!live) return
        setOccasions(body.occasions)
        setForm(profileForm(body))
        setLoaded(profileForm(body))
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
        body: JSON.stringify(profileBody(form, loaded)),
      })
      if (!response.ok) {
        setError(await errorMessage(response))
        return
      }
      const next = profileForm(await response.json())
      setForm(next)
      setLoaded(next)
      setSaved(true)
    } catch {
      setError('The save did not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <AdminPageHeader
      title={adminCopy.closetProfile.title}
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
    <label className={GARMENT_LABEL}>
      <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
        {label}
      </span>
      <input
        className={field}
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
      <form className={`garment-form ${GARMENT_FORM}`} onSubmit={save}>
        <fieldset className={GARMENT_FIELDSET}>
          <legend>{adminCopy.closetProfile.sizes}</legend>
          {CATEGORIES.map((c) => (
            <label key={c.value} className={GARMENT_LABEL}>
              <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
                {c.plural}
              </span>
              <input
                className={field}
                type="text"
                maxLength={40}
                value={form.sizes[c.value]}
                onChange={(e) => setIn('sizes', c.value)(e.target.value)}
              />
            </label>
          ))}
        </fieldset>

        <fieldset className={GARMENT_FIELDSET}>
          <legend>{adminCopy.closetProfile.coloring}</legend>
          {COLORING.map(([key, label]) => (
            <label key={key} className={GARMENT_LABEL}>
              <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
                {label}
              </span>
              <input
                className={field}
                type="text"
                maxLength={40}
                value={form.coloring[key]}
                onChange={(e) => setIn('coloring', key)(e.target.value)}
              />
            </label>
          ))}
        </fieldset>

        <label className={GARMENT_LABEL}>
          <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
            {adminCopy.closetProfile.buildFit}
          </span>
          <textarea
            className={textarea}
            rows={3}
            maxLength={500}
            value={form.build_fit}
            onChange={(e) => set('build_fit')(e.target.value)}
          />
        </label>
        <label className={GARMENT_LABEL}>
          <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
            {adminCopy.closetProfile.styleWords}
          </span>
          <input
            className={field}
            type="text"
            value={form.style_words}
            placeholder={adminCopy.closetProfile.styleWordsPlaceholder}
            onChange={(e) => set('style_words')(e.target.value)}
          />
          <span className="muted">
            {adminCopy.closetProfile.commaSeparated}
          </span>
        </label>
        <label className={GARMENT_LABEL}>
          <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
            {adminCopy.closetProfile.dislikes}
          </span>
          <input
            className={field}
            type="text"
            value={form.dislikes}
            placeholder={adminCopy.closetProfile.dislikesPlaceholder}
            onChange={(e) => set('dislikes')(e.target.value)}
          />
          <span className="muted">
            {adminCopy.closetProfile.commaSeparated}
          </span>
        </label>

        <fieldset className={`closet-week ${GARMENT_FIELDSET}`}>
          <legend>{adminCopy.closetProfile.usualWeek}</legend>
          {DAYS.map((day, i) => (
            <div key={day} className={`closet-week-day ${CLOSET_WEEK_DAY}`}>
              <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
                {day}
              </span>
              <select
                className={field}
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

        <fieldset className={GARMENT_FIELDSET}>
          <legend>{adminCopy.closetProfile.seasonsTurn}</legend>
          {[
            ['spring_turn', 'Spring'],
            ['autumn_turn', 'Autumn'],
          ].map(([key, label]) => (
            <label key={key} className={GARMENT_LABEL}>
              <span className={`garment-field-label ${GARMENT_FIELD_LABEL}`}>
                {label}
              </span>
              <input
                className={field}
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

        <fieldset className={GARMENT_FIELDSET}>
          <legend>{adminCopy.closetProfile.repeatsTagging}</legend>
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
          <div className={GARMENT_LABEL}>
            <label>
              <input
                type="checkbox"
                checked={form.rank_images}
                aria-describedby="rank-images-help"
                onChange={(e) => set('rank_images')(e.target.checked)}
              />{' '}
              {adminCopy.closetProfile.rankImages}
            </label>
            <span id="rank-images-help" className="muted">
              {adminCopy.closetProfile.rankImagesHelp}
            </span>
          </div>
        </fieldset>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="muted" role="status">
            {adminCopy.closetProfile.saved}
          </p>
        )}
        <div className={`garment-form-acts ${GARMENT_FORM_ACTS}`}>
          <button type="submit" className={btn('primary')} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
