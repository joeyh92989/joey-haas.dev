import { Link } from 'react-router'
import {
  backMonth,
  categoryLabel,
  garmentTitle,
  imageUrl,
  seasonLabel,
  shortDate,
} from '../lib/closet.js'

/** The trailing cell: what to do next with the row, if anything. */
function Trailing({ garment }) {
  if (garment.status === 'untagged') {
    return (
      <Link className="btn sm" to={`/admin/closet/${garment.id}`}>
        Add details
      </Link>
    )
  }
  if (garment.status === 'packed') {
    const month = backMonth(garment.back_on)
    return (
      <span className="garment-trail">
        {month ? `packed → ${month}` : 'packed'}
      </span>
    )
  }
  if (garment.status === 'listed' || garment.status === 'gone') {
    return <span className="garment-trail">{garment.status}</span>
  }
  return null
}

/**
 * The Closet's list view: one row per garment with its wears over twelve
 * months as a 4px meter scaled to the closet's most-worn piece. On a phone
 * the Type, Last worn and Season columns drop (`closet-hide-phone`), and
 * Piece, Wears and the trailing cell stay.
 *
 * @param {object} props
 * @param {object[]} props.garments Rows to show, already filtered.
 */
export default function GarmentTable({ garments }) {
  const most = Math.max(1, ...garments.map((g) => g.wears_12mo))
  return (
    <div className="garment-table-wrap">
      <table className="garment-table">
        <thead>
          <tr>
            <th scope="col">Piece</th>
            <th scope="col" className="closet-hide-phone">
              Type
            </th>
            <th scope="col">Wears 12 mo</th>
            <th scope="col" className="closet-hide-phone">
              Last worn
            </th>
            <th scope="col" className="closet-hide-phone">
              Season
            </th>
            <th scope="col">
              <span className="visually-hidden">Next</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {garments.map((garment) => {
            const src = imageUrl(garment)
            const untagged = garment.status === 'untagged'
            return (
              <tr key={garment.id} data-status={garment.status}>
                <td>
                  <Link
                    className="garment-row-name"
                    to={`/admin/closet/${garment.id}`}
                  >
                    <span
                      className="garment-thumb"
                      style={
                        garment.primary_hex
                          ? { backgroundColor: garment.primary_hex }
                          : undefined
                      }
                    >
                      {src && <img src={src} alt="" loading="lazy" />}
                    </span>
                    {untagged && !garment.name
                      ? 'Untagged photo'
                      : garmentTitle(garment)}
                  </Link>
                </td>
                <td className="closet-hide-phone garment-mono">
                  {categoryLabel(garment.category)?.toLowerCase() ?? '—'}
                </td>
                <td>
                  {untagged ? (
                    <span className="garment-mono">—</span>
                  ) : (
                    <span className="garment-wears">
                      <span className="garment-meter" aria-hidden="true">
                        <i
                          style={{
                            width: `${(garment.wears_12mo / most) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="garment-mono">{garment.wears_12mo}</span>
                    </span>
                  )}
                </td>
                <td className="closet-hide-phone garment-mono">
                  {garment.last_worn ? shortDate(garment.last_worn) : '—'}
                </td>
                <td className="closet-hide-phone garment-mono">
                  {seasonLabel(garment.seasons) ?? '—'}
                </td>
                <td className="garment-trail-cell">
                  <Trailing garment={garment} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
