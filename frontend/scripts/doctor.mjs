// `npm run doctor`: is node_modules what package-lock.json says? (#612)
//
// A checkout whose node_modules had fallen behind the lockfile (a dependency
// missing) made the admin Playwright config list 0 tests with no clear error.
// This asks npm for the installed tree and fails, naming the fix, when a
// dependency is missing or the wrong version. "extraneous" packages are
// ignored: they are harmless leftovers, not a reason to reinstall.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** The `npm ls` problem lines that mean node_modules is out of date. */
export function staleProblems(problems = []) {
  return problems.filter((line) => /^(missing|invalid):/.test(line))
}

/** Runs `npm ls --depth=0 --json` and returns its parsed output (it exits 1 on problems). */
function installedTree() {
  try {
    return JSON.parse(
      execFileSync('npm', ['ls', '--depth=0', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch (error) {
    return JSON.parse(error.stdout || '{}')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = staleProblems(installedTree().problems)
  if (stale.length) {
    console.error(
      `node_modules is out of date with package-lock.json:\n  ${stale.join('\n  ')}\nRun: npm ci`,
    )
    process.exit(1)
  }
  console.log('node_modules matches package-lock.json')
}
