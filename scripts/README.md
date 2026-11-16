# scripts/

Shell helpers for shipping. Each is a single bash file with its usage in the
header.

| Script | Does |
|---|---|
| `smoke.sh` | post-deploy smoke test of the site and API |
| `render-logs.sh` | recent error logs of the API service (needs `RENDER_API_KEY`) |
| `merge-train.sh` | merge a list of ready PRs into `main` one after another, no idle gap |
| `merge-train.test.sh` | tests for `merge-train.sh` against a fake `gh` |

## merge-train.sh

### Why

Branch protection on `main` requires `backend` and `frontend` **and** an
up-to-date branch (`strict`). Every merge therefore puts the other open PRs
behind `main`: each needs `gh pr update-branch` and a fresh CI run (5 to 7
minutes) before it can merge. On the closet epic (#392) the PRs merged about
7 minutes apart, one CI cycle each, and the gaps where nobody was watching
(a green PR waiting for someone to update the next one) cost as much as the
re-runs. The train removes the gaps; it cannot remove the cycle (that needs
`strict` off or a merge queue, which a user-owned repo may not have).

### Usage

```sh
# merge #411, then #412, then #413, in that order
./scripts/merge-train.sh 411 412 413

# look first: state, draft, merge state and mergeable per PR; changes nothing
./scripts/merge-train.sh --dry-run 411 412 413
```

For each PR, in the order given: stop unless it is open and not a draft;
`gh pr update-branch` if it is behind `main` (read from the compare API's
`behind_by`, since a PR that is behind and also waiting on checks can show
`BLOCKED`, not `BEHIND`); wait for the **required** checks (all of them: the names are read from branch
protection, since GitHub registers them one at a time after a push);
`gh pr merge --squash`; confirm it is `MERGED`; next. If a merge lands while
the checks run and the PR falls behind again, it goes round again (three
rounds at most).

Before each merge it prints a WARNING for any non-required check that is not
green (`e2e`, `e2e-admin`, `neon-rehearsal`); it does not stop for one, so read
it, as CLAUDE.md says.

Environment (all optional): `POLL_SECONDS` (20) between polls,
`MAX_WAIT_MINUTES` (30) per PR for the checks, `GRACE_SECONDS` (120) for the
checks of a new head to appear. The limits are wall-clock time.

Exit 0 = every PR merged. Exit 1 = it stopped on a PR and said why on stderr.
Exit 2 = bad usage.

### It stops, and does not retry, when

- a PR is closed, merged, or a draft;
- a PR conflicts with `main` (rebase it by hand);
- a required check fails (read it, fix it, rerun the train: an unrelated
  known flake gets one rerun by hand, per CLAUDE.md, not by the script);
- the checks do not finish in `MAX_WAIT_MINUTES`, or do not appear after a push;
- `gh` refuses to update or merge, or the compare API cannot be read (an
  unreadable answer is never taken as "behind").

### Gates it does not check

It checks the required status checks and only warns about the rest. The caller owns the rest of
`sdlc-ship`'s gate: finish review clean, migration rehearsal read, and, for a
PR with a migration, that it is additive. Run it only on PRs that passed those,
and only when you are allowed to merge (the ship step, or when asked).

### Gotchas

- Needs `gh` logged in with merge rights on the repo; it runs from any
  checkout of the repo.
- Order matters: put a PR that others depend on first. The train does not
  rebase dependent branches.
- Each merge deploys the API and applies migrations on its own (`deploy.yml`),
  so a train of migration PRs applies them one at a time, as before.
- `neon-rehearsal` allows two migration PRs at once; the train does not change
  that.
- Tested against a fake `gh` (`./scripts/merge-train.test.sh`), not a real
  PR pair. The first real use should be on two low-risk PRs.
