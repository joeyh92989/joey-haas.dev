/**
 * A plain class join: truthy strings, space separated. For eager components
 * (the entry chunk), where `cn` (tailwind-merge) is too heavy; it merges
 * nothing, so a component using it must not need one class to beat another
 * (#530). Lazy `components/ui` code keeps `cn` from `lib/utils.js`.
 *
 * @param {...(string|false|null|undefined)} parts
 * @returns {string}
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
