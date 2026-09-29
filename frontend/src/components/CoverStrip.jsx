import { useEffect, useState } from 'react'
import { topFavourites } from '../lib/shelf.js'
import { readSnapshot } from '../lib/snapshot.js'
import CoverImage from './CoverImage.jsx'

const STRIP_SIZE = 4

/**
 * Four favourite covers from the build-time snapshot, for Home and Projects.
 *
 * Those pages make no API calls, so this reads the static snapshot and
 * renders nothing until it arrives, or at all when there is none: the card
 * around it still reads as text. The covers are decorative. The strip sits
 * inside or beside a link whose text already names the destination, so
 * repeating four titles to a screen reader would be noise, and a link per
 * cover would nest links.
 */
export default function CoverStrip() {
  const [covers, setCovers] = useState([])

  useEffect(() => {
    let cancelled = false
    readSnapshot('items').then((items) => {
      if (!cancelled && items) setCovers(topFavourites(items, STRIP_SIZE))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (covers.length === 0) return null
  return (
    <span className="cover-strip" aria-hidden="true">
      {covers.map((item) => (
        <CoverImage key={item.id} src={item.cover_url} type={item.type} />
      ))}
    </span>
  )
}
