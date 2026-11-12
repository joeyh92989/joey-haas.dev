/**
 * The public changelog on /stats, read from `frontend/changelog.md`.
 *
 * The file is imported raw rather than through the markdown plugin: the
 * plugin compiles a post (frontmatter, one HTML document), and the page
 * needs dated entries. A line needs links only, so `renderLine` turns
 * `[text](href)` into a Link (a path) or an anchor (a URL) and leaves the
 * rest as text.
 *
 * The parser is `lib/changelog.js`, which `scripts/prerender.mjs` also
 * runs on the file during the build, so a bad file fails the build before
 * this module can throw in a visitor's browser.
 */

import { createElement } from 'react'
import { Link } from 'react-router'
import raw from '../../changelog.md?raw'
import { parseChangelog } from '../lib/changelog.js'
import { hiddenPaths } from '../lib/snapshotPresence.js'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/**
 * Whether an href is a page the router owns. A file on the site
 * (`/resume.pdf`, `/til/feed.xml`) is not: the router would match it to
 * the 404 page instead of letting the browser fetch it. Neither is a
 * protocol-relative URL (`//host/...`).
 *
 * @param {string} href
 * @returns {boolean}
 */
export function isRouterPath(href) {
  if (!href.startsWith('/') || href.startsWith('//')) return false
  const path = href.split(/[?#]/)[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  return !/\.[a-z0-9]+$/i.test(last)
}

/**
 * One changelog line as React nodes: text, with each markdown link a
 * router Link (a page path, see `isRouterPath`) or an anchor. A link to a
 * hidden path (a page with nothing on it yet) stays as plain text.
 *
 * @param {string} line
 * @param {string[]} [hidden] Paths to leave unlinked; this build's by default.
 * @returns {import('react').ReactNode[]}
 */
export function renderLine(line, hidden = hiddenPaths) {
  const nodes = []
  let last = 0
  for (const match of line.matchAll(LINK)) {
    if (match.index > last) nodes.push(line.slice(last, match.index))
    const [, text, href] = match
    if (hidden.includes(href)) {
      nodes.push(text)
      last = match.index + match[0].length
      continue
    }
    nodes.push(
      isRouterPath(href)
        ? createElement(Link, { key: match.index, to: href }, text)
        : createElement(
            'a',
            { key: match.index, href, rel: 'noreferrer' },
            text,
          ),
    )
    last = match.index + match[0].length
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

export const CHANGELOG = parseChangelog(raw)
