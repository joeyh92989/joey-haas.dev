/** The word for each entry state that carries a confidence. */
const WORDS = {
  exact: 'Exact',
  probable: 'Probable',
  check: 'Check',
  owned: 'On shelf',
}

/**
 * A match's confidence as a word in an outlined pill: Exact, Probable,
 * Check or On shelf. The word is the signal; the colour (`--ok`,
 * `--accent`, `--badge`, `--text-3`, measured in index.css) only repeats it.
 * Confidence is `matching.py`'s string distance, never the model's opinion.
 *
 * @param {object} props
 * @param {string} props.state An intake entry state.
 */
export default function ConfidenceBadge({ state }) {
  const word = WORDS[state]
  if (!word) return null
  return <span className={`conf conf-${state}`}>{word}</span>
}
