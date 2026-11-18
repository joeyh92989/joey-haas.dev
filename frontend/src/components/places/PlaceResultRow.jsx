import { Link } from 'react-router'
import { placesAdd as words } from '../../content/placesAdd.js'
import PlaceFields from './PlaceFields.jsx'

/** The map link of a result, with the place's name for a screen reader. */
function MapLink({ place }) {
  if (!place.map_url) return null
  return (
    <a className="place-maplink" href={place.map_url}>
      {words.viewOnMap}
      <span className="visually-hidden">{words.mapFor(place.title)}</span>
    </a>
  )
}

/**
 * One search result. Closed it offers Add; already saved it links to Spots;
 * open it holds the fields and Save place, with the place's name as the
 * focus target (`headRef`).
 *
 * @param {object} props
 * @param {object} props.place A search row (title, address, category, map_url,
 *   owned_spot_id).
 * @param {boolean} props.open
 * @param {boolean} props.busy A request for this row is under way.
 * @param {boolean} props.several More than one result is listed.
 * @param {object} props.values The fields while open.
 * @param {string[]} props.cities
 * @param {(values: object) => void} props.onValues
 * @param {(spotId: string) => void} [props.onShowInTable] When given, a saved
 *   result offers this action (the Spots page's table) in place of the link
 *   to /admin/spots.
 * @param {() => void} props.onAdd
 * @param {() => void} props.onSave
 * @param {() => void} props.onCancel
 * @param {import('react').Ref<HTMLElement>} props.headRef
 */
export default function PlaceResultRow({
  place,
  open,
  busy,
  several,
  values,
  cities,
  onValues,
  onShowInTable,
  onAdd,
  onSave,
  onCancel,
  headRef,
}) {
  const saved = Boolean(place.owned_spot_id)
  return (
    <li className={`place-result${open ? ' open' : ''}`}>
      <span className="place-result-text">
        <span
          className="place-result-title"
          tabIndex={open ? -1 : undefined}
          ref={open ? headRef : undefined}
        >
          {place.title}
        </span>
        {place.address && <span className="muted">{place.address}</span>}
        <MapLink place={place} />
      </span>
      {place.category && (
        <span className="place-result-kind">{place.category}</span>
      )}
      {saved && onShowInTable && (
        <span className="place-result-act">
          <span className="place-saved-mark">{words.alreadySaved}</span>
          <a
            className="btn"
            href={`#spot-${place.owned_spot_id}`}
            onClick={(event) => {
              event.preventDefault()
              onShowInTable(place.owned_spot_id)
            }}
          >
            {words.bar.showInTable}
            <span className="visually-hidden">
              {words.bar.showInTableFor(place.title)}
            </span>
          </a>
        </span>
      )}
      {saved && !onShowInTable && (
        <Link className="btn" to="/admin/spots">
          {words.alreadySaved}
          <span className="visually-hidden">
            {words.alreadySavedFor(place.title)}
          </span>
        </Link>
      )}
      {!saved && !open && (
        <button
          type="button"
          className="btn primary"
          aria-expanded="false"
          aria-label={words.addLabel(place.title, place.address)}
          disabled={busy}
          onClick={onAdd}
        >
          {words.add}
        </button>
      )}
      {!saved && open && (
        <div
          className="place-form"
          role="group"
          aria-label={words.detailsFor(place.title)}
        >
          <PlaceFields values={values} onChange={onValues} cities={cities} />
          <div className="intake-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={onSave}
            >
              {words.savePlace}
            </button>
            <button type="button" className="btn ghost" onClick={onCancel}>
              {several ? words.cancel : words.searchAgain}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
