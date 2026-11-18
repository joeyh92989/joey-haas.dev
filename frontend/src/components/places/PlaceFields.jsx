import { useId } from 'react'
import { TAG_LABELS, TAGS } from '../../content/denver.js'
import { placesAdd as words } from '../../content/placesAdd.js'
import { HOME_CITY, FALLBACK_CITIES, cityLabel } from '../../lib/cities.js'

// The city helper lives in lib/cities.js; these stay importable from here.
export { HOME_CITY, FALLBACK_CITIES, cityLabel }

/** The fields a found place starts with. */
export function emptyFields() {
  return {
    city: HOME_CITY,
    otherCity: '',
    tags: [],
    blurb: '',
    isPublic: false,
  }
}

/** The city these values stand for, as the server keeps it (lower case). */
export function effectiveCity(values) {
  const city = values.city === 'other' ? values.otherCity : values.city
  return city.trim().toLowerCase() || HOME_CITY
}

/** The owner fields as the API takes them. */
export function fieldsPayload(values) {
  const city = effectiveCity(values)
  return {
    city,
    tags: TAGS.filter((tag) => values.tags.includes(tag)),
    blurb: values.blurb.trim() || null,
    is_public: values.isPublic && city === HOME_CITY,
  }
}

/**
 * The fields the owner fills for a place: city, tags, blurb and whether it
 * shows on the public Denver page. The public box is off limits unless the
 * city is Denver (plan decision 15), and clears itself when the city moves.
 *
 * @param {object} props
 * @param {{city: string, otherCity: string, tags: string[], blurb: string, isPublic: boolean}} props.values
 * @param {(next: object) => void} props.onChange
 * @param {string[]} props.cities Cities other than Denver, as keys.
 */
export default function PlaceFields({ values, onChange, cities }) {
  const id = useId()
  const isHome = effectiveCity(values) === HOME_CITY
  let publicHint = words.publicOff
  if (!isHome) publicHint = words.publicOnlyDenver
  else if (values.isPublic) publicHint = ''

  function set(patch) {
    const next = { ...values, ...patch }
    if (effectiveCity(next) !== HOME_CITY) next.isPublic = false
    onChange(next)
  }

  function toggleTag(tag) {
    set({
      tags: values.tags.includes(tag)
        ? values.tags.filter((t) => t !== tag)
        : [...values.tags, tag],
    })
  }

  return (
    <div className="place-fields">
      <div className="intake-field">
        <label htmlFor={`${id}-city`}>{words.city}</label>
        <select
          id={`${id}-city`}
          aria-describedby={`${id}-city-h`}
          value={values.city}
          onChange={(event) => set({ city: event.target.value })}
        >
          {[HOME_CITY, ...cities.filter((c) => c !== HOME_CITY)].map((city) => (
            <option key={city} value={city}>
              {cityLabel(city)}
            </option>
          ))}
          <option value="other">{words.anotherCity}</option>
        </select>
        <p className="place-hint" id={`${id}-city-h`}>
          {words.cityHint}
        </p>
      </div>
      {values.city === 'other' && (
        <div className="intake-field">
          <label htmlFor={`${id}-city2`}>{words.cityName}</label>
          <input
            type="text"
            id={`${id}-city2`}
            autoComplete="off"
            autoFocus
            value={values.otherCity}
            onChange={(event) => set({ otherCity: event.target.value })}
          />
        </div>
      )}
      <div className="intake-field">
        <span className="lbl" id={`${id}-tags`}>
          {words.tags}
        </span>
        <div className="chip-row" role="group" aria-labelledby={`${id}-tags`}>
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="chip"
              aria-pressed={values.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>
      <div className="intake-field">
        <label htmlFor={`${id}-blurb`}>{words.blurb}</label>
        <input
          type="text"
          id={`${id}-blurb`}
          maxLength={140}
          autoComplete="off"
          aria-describedby={`${id}-blurb-h`}
          value={values.blurb}
          onChange={(event) => set({ blurb: event.target.value })}
        />
        <p className="place-hint" id={`${id}-blurb-h`}>
          {words.blurbHint}
        </p>
      </div>
      <div>
        <label className="place-check" htmlFor={`${id}-public`}>
          <input
            type="checkbox"
            id={`${id}-public`}
            aria-describedby={publicHint ? `${id}-public-h` : undefined}
            disabled={!isHome}
            checked={values.isPublic}
            onChange={(event) => set({ isPublic: event.target.checked })}
          />{' '}
          {words.isPublic}
        </label>
        {publicHint && (
          <p className="place-hint" id={`${id}-public-h`}>
            {publicHint}
          </p>
        )}
      </div>
    </div>
  )
}
