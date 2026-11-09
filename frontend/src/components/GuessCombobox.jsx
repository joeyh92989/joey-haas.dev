import { useId, useState } from 'react'
import CoverImage from './CoverImage.jsx'
import { daily } from '../content/daily.js'
import {
  MAX_GUESSES,
  matchTitle,
  shortPlatform,
  suggest,
  yearOf,
} from '../lib/daily.js'

const copy = daily.input

/**
 * The guess field: a combobox over the public titles with the search
 * dialog's keyboard contract (arrows move, Enter picks, Escape closes). Up
 * to six suggestions, prefix matches first, titles already guessed left
 * out. Enter on a full title submits without a highlight; text matching
 * nothing is refused through `onReject`.
 *
 * @param {object} props
 * @param {object[]} props.pool The answer pool.
 * @param {string[]} props.excludedIds Ids already guessed.
 * @param {number} props.guessNumber The guess about to be made, from 1.
 * @param {boolean} props.disabled After a win or the sixth guess.
 * @param {(item: object) => void} props.onSubmit A pool item was chosen.
 * @param {() => void} props.onReject The text matched no title.
 */
export default function GuessCombobox({
  pool,
  excludedIds,
  guessNumber,
  disabled,
  onSubmit,
  onReject,
}) {
  const id = useId()
  const listId = `${id}-list`
  const optionId = (index) => `${id}-option-${index}`
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)

  const rows = closed ? [] : suggest(query, pool, excludedIds)
  const current = rows.length > 0 ? Math.min(active, rows.length - 1) : -1

  function choose(item) {
    setQuery('')
    setActive(0)
    setClosed(false)
    onSubmit(item)
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (closed) {
        setClosed(false)
        return
      }
      if (!rows.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + rows.length) % rows.length)
    } else if (event.key === 'Escape') {
      if (rows.length) {
        event.preventDefault()
        setClosed(true)
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (current >= 0) {
        choose(rows[current])
        return
      }
      const exact = matchTitle(query, pool)
      if (exact && !excludedIds.includes(exact.id)) {
        choose(exact)
      } else if (query.trim() !== '') {
        onReject()
      }
    }
  }

  return (
    <div className="guess-box">
      <label className="visually-hidden" htmlFor={`${id}-input`}>
        {copy.label}
      </label>
      <input
        id={`${id}-input`}
        type="text"
        className="guess-input"
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(current) : undefined}
        aria-describedby={`${id}-count`}
        autoComplete="off"
        spellCheck={false}
        placeholder={copy.placeholder}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setClosed(false)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setClosed(true)}
        onFocus={() => setClosed(false)}
      />
      <span id={`${id}-count`} className="guess-count muted">
        {copy.count(guessNumber, MAX_GUESSES)}
      </span>
      <ul
        id={listId}
        role="listbox"
        aria-label={copy.suggestions}
        className="guess-list"
        hidden={rows.length === 0}
      >
        {rows.map((item, index) => (
          <li
            key={item.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === current}
            // Choosing with the pointer must beat the input's blur.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
            onMouseMove={() => setActive(index)}
          >
            <span className="guess-thumb">
              <CoverImage src={item.cover_url} type="game" />
            </span>
            <span className="guess-title">{item.title}</span>
            <span className="guess-sub muted">
              {shortPlatform(item.platform)} · {yearOf(item)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
