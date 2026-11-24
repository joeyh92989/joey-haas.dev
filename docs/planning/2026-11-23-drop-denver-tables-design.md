# Drop the Denver tables (migration 0030)

Story #632 of epic #630. PR #633 removed the code and models; this is the
database half. Joey authorised the destructive step.

## What drops

Tables `visits`, `dismissals`, `candidates`, `spots`, `spot_settings` (that
order, by foreign keys: `visits.spot_id` and `candidates.nearest_anchor_id`
reference `spots.id`), then the enum type `candidate_source` (used by
`spots.source`, `candidates.source`, `dismissals.source`). `weather_hours`
stays (still mapped). Nothing else references these tables: `intake_sittings`
has a JSON key named `candidates` that is unrelated.

## Row loss

Every row in `spots`, `visits`, `candidates`, `dismissals` and
`spot_settings` is discarded by design. Production held 0 spots and 0 visits
on 2026-11-20 (0028's check); `spot_settings` held job summaries and saved
weekend plans, which have no remaining reader.

## Restore and rollback

- Before apply, the lead takes a Neon snapshot (restore point); it is the only
  way to get rows back.
- `alembic downgrade 0029` recreates the **empty** structure only (tables,
  index, unique and check constraints, foreign keys, enum), copied from 0013.
- Rollback of a bad apply: restore the Neon snapshot, then downgrade if the
  code must go back.

## Tests

- 0030 drops the five tables and the enum, keeps `weather_hours`.
- Upgrade, downgrade, upgrade cycle; downgrade brings back empty tables.
- The `DENVER_TABLES` carve-out in the schema diff applies only below 0030, so
  head must match the models exactly; head revision pins bump to 0030.

No new route, env var or outbound call. Changelog: no public change.
