// Heuristic scan for inline visible strings in admin pages (#300).
// Pure: takes source text, returns [{ line, text, kind }].
// Limits: regex, not a parser. It misses strings built in JS (template
// literals, ternaries, variables) and props other than title, aria-label,
// placeholder and alt. Text holding `&&` or `||` is code after a `>` operator,
// not words, and is skipped.
const PROPS = ['title', 'aria-label', 'placeholder', 'alt']

function blank(src) {
  // Keep length and newlines so offsets still map to line numbers.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:'"`\\])\/\/[^\n]*/g,
      (m, p) => p + m.slice(p.length).replace(/[^\n]/g, ' '),
    )
}

export function scanSource(src) {
  const text = blank(src)
  const lineAt = (i) => text.slice(0, i).split('\n').length
  const found = []
  const jsx = /(?<![=-])>([^<>{}=;]*?[A-Za-z][^<>{}=;]*?)</g
  for (const m of text.matchAll(jsx)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (/[A-Za-z]{2}/.test(t) && !/^[)\]}]|\breturn\b|&&|\|\|/.test(t)) {
      found.push({ line: lineAt(m.index + 1), text: t, kind: 'text' })
    }
  }
  const prop = new RegExp(
    `\\s(${PROPS.join('|')})=(?:"([^"]*[A-Za-z][^"]*)"|'([^']*[A-Za-z][^']*)')`,
    'g',
  )
  for (const m of text.matchAll(prop)) {
    found.push({ line: lineAt(m.index), text: m[2] ?? m[3], kind: m[1] })
  }
  return found.sort((a, b) => a.line - b.line)
}
