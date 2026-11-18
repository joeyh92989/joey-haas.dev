/**
 * ISBN helpers for the collected-books rows (story #336). Pure.
 *
 * The server checks every ISBN again (`sources/openlibrary.normalize_isbn`)
 * and is the authority; this only spares a request for a typo and says why a
 * code was refused.
 */

/** An ISBN as typed: hyphens and spaces dropped, a trailing x capitalised. */
export const cleanIsbn = (text) =>
  String(text ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()

/**
 * The ISBN-13 for a typed or scanned code, or null when it is not an ISBN
 * (wrong length, a bad check digit, an EAN that does not start 978 or 979).
 * An ISBN-10 is converted.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function toIsbn13(text) {
  const code = cleanIsbn(text)
  const check13 = (first12) => {
    let sum = 0
    for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 ? 3 : 1)
    return String((10 - (sum % 10)) % 10)
  }
  if (/^\d{9}[\dX]$/.test(code)) {
    let sum = 0
    for (let i = 0; i < 10; i += 1) {
      sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i)
    }
    if (sum % 11 !== 0) return null
    const body = `978${code.slice(0, 9)}`
    return body + check13(body)
  }
  if (/^\d{13}$/.test(code) && /^97[89]/.test(code)) {
    return check13(code.slice(0, 12)) === code[12] ? code : null
  }
  return null
}

/**
 * The label a looked-up book gets: "Vol. 2" when the subtitle gave a number,
 * else the subtitle, else the title. The owner can change it.
 */
export function labelFor(result) {
  if (result.volume_number) return `Vol. ${result.volume_number}`
  return (result.subtitle || result.title || '').slice(0, 80)
}

/**
 * A book row with the lookup's answer filled in where the row is blank.
 * Typed text is never overwritten. Only the label can come from the
 * lookup: the kind and the issues it collects are not in Open Library.
 *
 * @param {{kind: string, label: string, from: string, to: string, isbn: string}} row
 * @param {object} result The route's body.
 */
export function fillRow(row, result) {
  if (!result?.found) return row
  return {
    ...row,
    isbn: toIsbn13(row.isbn ?? '') ?? row.isbn,
    label: row.label.trim() ? row.label : labelFor(result),
  }
}

/** What the lookup found, as one line: title, publisher, year and pages. */
export function foundLine(result) {
  const name = result.subtitle
    ? `${result.title}: ${result.subtitle}`
    : result.title
  return [
    name,
    result.publisher,
    result.year,
    result.pages ? `${result.pages} pages` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
