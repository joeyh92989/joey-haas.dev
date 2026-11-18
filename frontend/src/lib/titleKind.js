import { spine } from '../content/spine.js'

/**
 * What a comic title is: `run`, `book_line`, `single_book` or `both`, from the
 * public comic block (the admin wall's carries the same field). A body from
 * before the kind existed, or a word this build does not know, is a run: the
 * page as it always was.
 *
 * @param {{kind?: string}|null|undefined} comic
 * @returns {'run'|'book_line'|'single_book'|'both'}
 */
export function titleKind(comic) {
  return Object.hasOwn(spine.comics.kinds, comic?.kind) ? comic.kind : 'run'
}

/** The kind in words: "Line of books". */
export function kindWord(comic) {
  return spine.comics.kinds[titleKind(comic)]
}
