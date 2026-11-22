import { tagGroupsOf, tagPicker } from '../content/tags.js'
import { toggleTag } from '../lib/tags.js'
import { MUTED, chipBtn } from './adminDataClasses.js'
import { CTL_LABEL, CTL_ROW_WIDE } from './shelf-classes.js'
import { COMIC_HINT, TAG_PICKER } from './comicAdminClasses.js'

/**
 * The edit pages' tag picker: each group of the type's vocabulary as a
 * labelled row of toggles. A tag can only be chosen from the vocabulary, so
 * the picker has no free text. It holds no state: the form owns `value`, and
 * Save sends it (which also marks the tags as the owner's).
 *
 * @param {object} props
 * @param {string} props.type - 'game' or 'comic'.
 * @param {{group: string, tag: string}[]} props.value
 * @param {(next: {group: string, tag: string}[]) => void} props.onChange
 */
export default function TagPicker({ type, value, onChange }) {
  const groups = tagGroupsOf(type)
  if (groups.length === 0) return null
  return (
    <fieldset className={`tag-picker ${TAG_PICKER}`}>
      <legend>{tagPicker.title}</legend>
      <p className={`${MUTED} comic-hint ${COMIC_HINT}`}>{tagPicker.hint}</p>
      {groups.map((group) => (
        <div key={group.key} className={`ctl-row ${CTL_ROW_WIDE}`}>
          <span className={`ctl-label ${CTL_LABEL}`} id={`tags-${group.key}`}>
            {group.label}
          </span>
          <div
            className="chip-row"
            role="group"
            aria-labelledby={`tags-${group.key}`}
          >
            {group.tags.map((tag) => {
              const on = value.some(
                (entry) => entry.group === group.key && entry.tag === tag.key,
              )
              return (
                <button
                  key={tag.key}
                  type="button"
                  className={chipBtn}
                  aria-pressed={on}
                  onClick={() =>
                    onChange(toggleTag(type, value, group.key, tag.key))
                  }
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </fieldset>
  )
}
