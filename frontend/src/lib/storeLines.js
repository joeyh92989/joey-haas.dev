/**
 * The name a store line goes by. When one store lists a game more than
 * once (a standard and a collector's edition, say), each line also carries
 * its listing's title, so the lines can be told apart (#129). Rows stored
 * before `listing_title` existed have none and keep the bare store name.
 */
export function storeLabel(line, lines = []) {
  const repeated =
    lines.filter((other) => other.store === line.store).length > 1
  return repeated && line.listing_title
    ? `${line.store} — ${line.listing_title}`
    : line.store
}
