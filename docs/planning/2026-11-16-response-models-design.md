---
status: planned
kind: refactor
mode: auto
---
# response_model on backend routes (#373 to #377)

## Problem
About 99 routes return plain dicts with no `response_model` (counted 2026-11-16 by decorator): intake 21, comics 17, closet 27, recommendations/picker/spots 21, the rest 12. The OpenAPI schema does not pin their bodies, and a private field can reach a body unnoticed. #301 split this into five area issues; this plan covers all five, shipped one PR per area, one at a time.

## Scope
In: add a Pydantic `response_model` to every route in the issue's files, matching today's JSON exactly. Out: any change to a body's fields or values, new routes, frontend.

## Rules
- Before editing a route, capture its current response for at least one test case (existing tests usually assert on it) and keep those tests green unchanged. Add `response_model_exclude_none`/`by_alias` only if today's body requires it; a model that adds or drops a key is a bug.
- Models live beside the routes (or in the area's existing models module); reuse existing Pydantic models where the route already builds one. Shared ack bodies (`{"ok": true}`-style) get one small shared model.
- A model for a body with open-ended content (JSONB) uses `dict[str, Any]` for that field, not an invented shape.
- `tests/test_public_outputs.py` and `tests/test_job_token.py` stay green. Admin-only routes are in scope; public bodies are not changed.
- A route that cannot take a model (streaming, redirect, file) gets `response_model=None` with a one-line comment saying why.

## Acceptance
Every route in the issue's files declares a `response_model` or an explained `None`; targeted pytest for those routes passes; `ruff format --check .` and `ruff check .` pass; no body changes. A PR per area: #373 intake, #374 comics, #375 closet, #376 recommendations/picker/spots, #377 the rest.

## Ship notes
Backend only, no migration, no changelog entry.
