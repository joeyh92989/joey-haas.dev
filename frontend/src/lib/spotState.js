/**
 * The state of a spot, derived on read from `visit_count`; nothing is stored.
 * `'want'`: not an anchor, no visits (or no count). `'been'`: not an anchor,
 * at least one visit. `null`: an anchor, which has no state.
 */
export function spotState(spot) {
  if (spot?.anchor) return null
  return (spot?.visit_count ?? 0) > 0 ? 'been' : 'want'
}

/** `{want, been}` over the rows given; anchors are skipped. */
export function stateCounts(spots) {
  const counts = { want: 0, been: 0 }
  for (const spot of spots ?? []) {
    const state = spotState(spot)
    if (state) counts[state] += 1
  }
  return counts
}
