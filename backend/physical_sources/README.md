# `physical_sources/` — the physical catalogue's sources

Which games exist physically, and as what: the r/NSCollectors registry,
`switch2-tracker` as a cross-check, twelve boutique stores and IGDB's N64
catalogue, read into the E7c catalogue tables. Spec:
`docs/planning/2026-09-23-tracker-e7c-design.md`.

**Fixtures first.** No parser is written before its fixture exists in
`tests/fixtures/physical/`, recorded by `scripts/record_physical_fixtures.py`
(see `scripts/README.md`). Every `parse_*` / `explode` function is tested on
those real bytes, never on a shape remembered from the research.

**Pure modules.** Everything here except `catalogue`, `resolve`, `sync` and
`platform_policy` imports nothing from FastAPI or SQLAlchemy;
`tests/test_physical_imports.py` enforces it.

The full interface, the `STORES` table and how to add a store are filled in
with Task 23 of the plan.
