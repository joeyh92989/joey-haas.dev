/**
 * A stop's public half: what the public API returns, framed, with a caption
 * saying what it is. The heading above it lives in Stop.
 */
export default function LiveBox({ caption, children }) {
  return (
    <div className="tour-live">
      {children}
      {caption && <p className="tour-live-caption">{caption}</p>}
    </div>
  )
}
