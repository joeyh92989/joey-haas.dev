/**
 * Photos chosen on the new-batch page, held in memory for the batch page that
 * uploads them. The batch is created on the first photo (#493), so the files
 * have to travel from the page that made it to the page that owns its
 * uploads; a File cannot go in the URL and is not worth keeping in history
 * state, where a reload would send it again. One-shot: taking clears it.
 */
const pending = new Map()

/** Holds `files` for the batch `id`. */
export function stashFiles(id, files) {
  pending.set(id, files)
}

/** The files held for `id` (none after the first call). */
export function takeFiles(id) {
  const files = pending.get(id) ?? []
  pending.delete(id)
  return files
}
