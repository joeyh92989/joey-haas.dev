import { useId } from 'react'
import { TAG_LABELS, TAGS } from '../../content/denver.js'
import { placesAdd as words } from '../../content/placesAdd.js'

/** The city every place defaults to, and the only one that can be public. */
export const HOME_CITY = 'denver'

/** Cities offered when the saved spots have none besides Denver. */
export const FALLBACK_CITIES = ['boulder', 'golden', 'fort collins']

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

/** A city key as a label: "fort collins" as "Fort Collins". */
export function cityLabel(city) {
  return city.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
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
            aria-describedby={`${id}-public-h`}
            disabled={!isHome}
            checked={values.isPublic}
            onChange={(event) => set({ isPublic: event.target.checked })}
          />{' '}
          {words.isPublic}
        </label>
        <p className="place-hint" id={`${id}-public-h`}>
          {!isHome
            ? words.publicOnlyDenver
            : values.isPublic
              ? ''
              : words.publicOff}
        </p>
      </div>
    </div>
  )
}
