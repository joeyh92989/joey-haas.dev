import { Link } from 'react-router'
import {
  backMonth,
  categoryLabel,
  garmentTitle,
  imageUrl,
  seasonLabel,
  shortDate,
} from '../lib/closet.js'
import {
  btn,
  GARMENT_METER,
  GARMENT_ROW_NAME,
  GARMENT_STAT,
  GARMENT_TABLE,
  GARMENT_TABLE_WRAP,
  GARMENT_TD,
  GARMENT_TH,
  GARMENT_THUMB,
  GARMENT_TRAIL_CELL,
  GARMENT_WEARS,
  HIDE_PHONE,
} from './closetClasses.js'

/** The trailing cell: what to do next with the row, if anything. */
function Trailing({ garment }) {
  if (garment.status === 'untagged') {
    return (
      <Link className={btn('plain', 'sm')} to={`/admin/closet/${garment.id}`}>
        Add details
      </Link>
    )
  }
  if (garment.status === 'packed') {
    const month = backMonth(garment.back_on)
    return (
      <span className={`garment-trail ${GARMENT_STAT}`}>
        {month ? `packed → ${month}` : 'packed'}
      </span>
    )
  }
  if (garment.status === 'listed' || garment.status === 'gone') {
    return (
      <span className={`garment-trail ${GARMENT_STAT}`}>{garment.status}</span>
    )
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
    <div className={`garment-table-wrap ${GARMENT_TABLE_WRAP}`}>
      <table className={`garment-table ${GARMENT_TABLE}`}>
        <thead>
          <tr>
            <th scope="col" className={GARMENT_TH}>
              Piece
            </th>
            <th
              scope="col"
              className={`closet-hide-phone ${GARMENT_TH} ${HIDE_PHONE}`}
            >
              Type
            </th>
            <th scope="col" className={GARMENT_TH}>
              Wears 12 mo
            </th>
            <th
              scope="col"
              className={`closet-hide-phone ${GARMENT_TH} ${HIDE_PHONE}`}
            >
              Last worn
            </th>
            <th
              scope="col"
              className={`closet-hide-phone ${GARMENT_TH} ${HIDE_PHONE}`}
            >
              Season
            </th>
            <th scope="col" className={GARMENT_TH}>
              <span className="visually-hidden">Next</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {garments.map((garment) => {
            const src = imageUrl(garment, { size: 'thumb' })
            const untagged = garment.status === 'untagged'
            return (
              <tr key={garment.id} data-status={garment.status}>
                <td className={GARMENT_TD}>
                  <Link
                    className={`garment-row-name ${GARMENT_ROW_NAME}`}
                    to={`/admin/closet/${garment.id}`}
                  >
                    <span
                      className={`garment-thumb ${GARMENT_THUMB}`}
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
                <td
                  className={`closet-hide-phone garment-mono ${GARMENT_TD} ${GARMENT_STAT} ${HIDE_PHONE}`}
                >
                  {categoryLabel(garment.category)?.toLowerCase() ?? '—'}
                </td>
                <td className={GARMENT_TD}>
                  {untagged ? (
                    <span className={`garment-mono ${GARMENT_STAT}`}>—</span>
                  ) : (
                    <span className={`garment-wears ${GARMENT_WEARS}`}>
                      <span
                        className={`garment-meter ${GARMENT_METER}`}
                        aria-hidden="true"
                      >
                        <i
                          style={{
                            width: `${(garment.wears_12mo / most) * 100}%`,
                          }}
                        />
                      </span>
                      <span className={`garment-mono ${GARMENT_STAT}`}>
                        {garment.wears_12mo}
                      </span>
                    </span>
                  )}
                </td>
                <td
                  className={`closet-hide-phone garment-mono ${GARMENT_TD} ${GARMENT_STAT} ${HIDE_PHONE}`}
                >
                  {garment.last_worn ? shortDate(garment.last_worn) : '—'}
                </td>
                <td
                  className={`closet-hide-phone garment-mono ${GARMENT_TD} ${GARMENT_STAT} ${HIDE_PHONE}`}
                >
                  {seasonLabel(garment.seasons) ?? '—'}
                </td>
                <td
                  className={`garment-trail-cell ${GARMENT_TD} ${GARMENT_TRAIL_CELL}`}
                >
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
