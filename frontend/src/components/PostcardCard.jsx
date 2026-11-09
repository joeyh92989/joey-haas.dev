/**
 * A photo-less day's prose, set as a postcard: a bordered `--surface` card
 * with the day's place stamped in its corner, so a day with nothing to show
 * still puts an object on the page and the rhythm of the photo days holds.
 *
 * The stamp repeats the place already in the day's heading, so it is
 * decoration and hidden from screen readers.
 *
 * @param {object} props
 * @param {string} props.place
 * @param {string} props.html The day's compiled prose.
 */
export default function PostcardCard({ place, html }) {
  return (
    <div className="postcard">
      <span className="postcard__stamp" aria-hidden="true">
        {place}
      </span>
      <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
