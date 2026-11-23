import { TOUR_LIVE, TOUR_LIVE_CAPTION } from './tourClasses.js'
/**
 * A stop's public half: what the public API returns, framed, with a caption
 * saying what it is. The heading above it lives in Stop.
 */
export default function LiveBox({ caption, children }) {
  return (
    <div className={`tour-live ${TOUR_LIVE}`}>
      {children}
      {caption && (
        <p className={`tour-live-caption ${TOUR_LIVE_CAPTION}`}>{caption}</p>
      )}
    </div>
  )
}
