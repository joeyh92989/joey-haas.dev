/**
 * The public changelog's parser, pure so the build can run it.
 *
 * `frontend/changelog.md` is `## YYYY-MM-DD` headings with `- ` bullets
 * under each. `scripts/prerender.mjs` parses the file during `npm run
 * build`, so a bad file fails the build; `content/changelog.js` parses the
 * same text for the page. Both go through `parseChangelog`.
 *
 * A link's URL may not contain `)`: lines carry links only, no code.
 */

const DATE_HEADING = /^## (\d{4}-\d{2}-\d{2})\s*$/
const BULLET = /^- (.*)$/

/** Whether `YYYY-MM-DD` names a real calendar day. */
function isCalendarDay(date) {
  const parsed = new Date(`${date}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
  )
}

/**
 * Parses the changelog into entries, newest first whatever the file order.
 *
 * Before the first date heading only a `# ` title and prose are allowed.
 * A bullet may continue on indented lines; an indented bullet is refused
 * (one level only). Throws on a heading that is not a real date, a date
 * with no bullets, a date used twice, or text under a date that is not a
 * bullet, so a bad file fails the build rather than the page.
 *
 * @param {string} text
 * @returns {{date: string, lines: string[]}[]}
 */
export function parseChangelog(text) {
  const entries = []
  let entry = null
  for (const line of text.split(/\r?\n/)) {
    if (/^#{2,}/.test(line)) {
      const date = line.match(DATE_HEADING)
      if (!date || !isCalendarDay(date[1])) {
        throw new Error(`changelog.md: not a date heading: ${line}`)
      }
      if (entry && entry.lines.length === 0) {
        throw new Error(`changelog.md: no changes under ${entry.date}`)
      }
      if (entries.some((seen) => seen.date === date[1])) {
        throw new Error(`changelog.md: ${date[1]} appears twice`)
      }
      entry = { date: date[1], lines: [] }
      entries.push(entry)
      continue
    }
    if (!entry) continue
    const bullet = line.match(BULLET)
    if (bullet) {
      entry.lines.push(bullet[1].trim())
    } else if (/^\s+- /.test(line)) {
      throw new Error(
        `changelog.md: nested bullet under ${entry.date}: ${line}`,
      )
    } else if (/^\s+\S/.test(line) && entry.lines.length) {
      entry.lines[entry.lines.length - 1] += ` ${line.trim()}`
    } else if (line.trim()) {
      throw new Error(`changelog.md: not a bullet under ${entry.date}: ${line}`)
    }
  }
  if (entry && entry.lines.length === 0) {
    throw new Error(`changelog.md: no changes under ${entry.date}`)
  }
  return entries.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
}
