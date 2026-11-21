import { denver, tagLabel } from '../content/denver.js'
import { Badge } from './ui/badge.jsx'
import { CARD_SHELL } from './ui/card-classes.js'
import { cn } from '../lib/utils.js'

// The Card's shell (ui/card-classes.js) with its own padding; a selected spot
// takes a 3px accent edge and an inset ring besides the `selected` class, so
// the choice is not colour alone. No `gap`: the parts carry their own margins.
const CARD = `${CARD_SHELL} px-4 py-3 scroll-mt-4`
// An inset shadow, not a wider border: the content does not move on select.
const SELECTED =
  'border-primary shadow-[inset_3px_0_0_var(--accent),inset_0_0_0_1px_var(--accent)]'

const KICKER =
  'mx-0 mt-0 mb-1 font-mono text-[0.75rem] tracking-[0.08em] text-(color:--text-3) uppercase'
const HEAD = 'flex items-baseline justify-between gap-3'
const NAME = 'spot-card-name m-0 text-[1rem] font-medium'
const NAME_BUTTON =
  'cursor-pointer bg-transparent text-start text-foreground [border:0] [font:inherit] [padding:0] hover:text-accent-text focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'
const AREA = 'text-[0.8125rem] whitespace-nowrap text-(color:--text-3)'
const BLURB = 'mx-0 mt-2 mb-0 text-[0.875rem] text-muted-foreground'
const TAGS = 'mx-0 mt-2 mb-0 flex list-none flex-wrap gap-1 p-0'

/** A spot's tags as small pills, in the order the API gave them. */
export function SpotTags({ tags }) {
  if (tags.length === 0) return null
  return (
    <ul className={TAGS}>
      {tags.map((tag) => (
        <Badge key={tag} render={<li />} variant="outline">
          {tagLabel(tag)}
        </Badge>
      ))}
    </ul>
  )
}

/**
 * One spot in the /denver list (spec: Denver spots, Surface 1).
 *
 * An `article`, not a link: there is no spot page. The name is a toggle
 * button that selects the spot, which marks its pin on the map; the
 * selected card takes the accent border. A spot whose point is outside the
 * drawn map says so in a kicker rather than silently having no pin.
 *
 * @param {object} props
 * @param {{name: string, neighbourhood: string|null, tags: string[],
 *   blurb: string|null}} props.spot A public spot.
 * @param {boolean} [props.selected] Whether this is the selected spot.
 * @param {boolean} [props.offMap] Whether its point is outside the map.
 * @param {() => void} [props.onSelect] The name was pressed.
 * @param {import('react').Ref<HTMLElement>} [props.ref] The article, so the
 *   page can scroll it into view (React 19 passes `ref` as a prop).
 */
export default function SpotCard({
  spot,
  selected = false,
  offMap = false,
  onSelect,
  ref,
}) {
  return (
    <article
      ref={ref}
      className={cn(
        'spot-card',
        selected && 'selected',
        CARD,
        selected && SELECTED,
      )}
    >
      {offMap ? <p className={KICKER}>{denver.page.offMap}</p> : null}
      <div className={HEAD}>
        <h2 className={NAME}>
          {onSelect ? (
            <button
              type="button"
              className={NAME_BUTTON}
              aria-pressed={selected}
              onClick={onSelect}
            >
              {spot.name}
            </button>
          ) : (
            spot.name
          )}
        </h2>
        {spot.neighbourhood ? (
          <span className={AREA}>{spot.neighbourhood}</span>
        ) : null}
      </div>
      <SpotTags tags={spot.tags} />
      {spot.blurb ? <p className={BLURB}>{spot.blurb}</p> : null}
    </article>
  )
}
