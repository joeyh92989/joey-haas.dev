---
status: planned
date: 2026-11-11
topic: llm-fallback-chain
spec: 2026-11-11-llm-fallback-chain-design.md
---

# A faster, longer free chain with a paid last resort (plan)

Written 2026-11-11 by Code. The spec ([2026-11-11-llm-fallback-chain-design.md](2026-11-11-llm-fallback-chain-design.md)) stands except where
"Research findings" says otherwise.

## Research findings (answers to "Open questions for Code")

| Question | Answer | Source |
|---|---|---|
| Thinking field on `generateContent` | `generationConfig.thinkingConfig.thinkingLevel`, enum `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` (send uppercase, the documented enum). The reference says using it on pre-Gemini-3 models "results in an error". | https://aistudio.google.com/api-reference/generate-content |
| Levels per model | 3.8 Flash: low/medium/high. 3.6 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite: minimal and up (Flash-Lite already defaults to minimal). 2.5 models: listed with levels, but see the row above. | https://aistudio.google.com/docs/thinking |
| 2.5 thinking budget | Not documented: no `thinkingBudget` range, minimum, or "0 = off". | same pages |
| `thinkingLevel` + `responseSchema` | No documented conflict and no documented support. Confirmed only by the probe (task 1). | https://aistudio.google.com/docs/structured-output |
| Haiku 5.5 structured outputs | GA via `output_config.format`, no beta header. Images supported. $0.10 / $0.50 per 1M up to 100K-token prompts. Schemas must keep `additionalProperties: false` and use no min/max constraints (true of today's schemas, which already run on Haiku 4.5). | https://platform.claude.com/docs/en/build-with-claude/structured-outputs , https://platform.claude.com/docs/en/models/haiku-5-5/overview |
| Free-tier daily quota per model | Not published. The 429 body carries `violations[].quotaValue` in practice, which comes from third-party logs, not Google docs. The probe reads it when present; otherwise `FREE_TIER_DAILY_REQUESTS = 20` stays. | https://aistudio.google.com/docs/rate-limits ; forum logs linked in research notes |
| Which models are served | **Not yet checked.** The live `models.list` probe is task 1 and needs Joey's OK to run with the real key. | — |

**What the code already does (found while planning, not in the spec):**

- Overload retries are already down to one attempt per model, except the
  last model, which still backs off 2s/5s/10s (`llm.py`, commit 1c3c2be).
  The "Fewer retries" change is therefore small: the last Gemini link gets at
  most one retry, and none when the paid link follows it.
- There is an eighth call site, the intake reader (`intake/reader.py`,
  `intake/nightly.py`, `intake/routes.py`). It is unchanged, like the other
  seven.
- `intake/budget.UsageRecorder` already writes every attempt and every
  per-day 429 to `llm_usage` in Postgres. `budget.remaining()` computes the
  reader's daily allowance as `20 × len(GEMINI_MODELS)` minus a reserve of 12.
  A six-model chain raises that from 48 to 108. That is correct only if every
  new model really has 20 a day, so task 1's quota readings feed it.

## Decisions taken while planning

- **D1: Thinking for the 2.5 models.** Each chain entry carries its own
  `thinkingConfig` or `None`. The 3.x entries get the lowest accepted
  level (`MINIMAL`, or `LOW` for 3.8 Flash). The 2.5 entries get `None`
  (model default) unless the probe shows a `thinkingBudget` value they
  accept. As a safety net, a 400 whose message names thinking is retried
  once on the same model without `thinkingConfig`, and logged at WARNING so
  a bad entry gets noticed. *Deviation:* the AC "every Gemini request
  carries a thinking level" becomes "every 3.x request does", because the
  docs say the field breaks 2.5.
- **D2: Exhaustion memory is in-process,** as the spec says: a module-level
  `{model: exhausted_until}` dict. The existing Postgres recorder keeps
  writing as it does today. Reading it back on each call would be a DB round
  trip per model call, and the spec ruled out persisted quota state.
  `_next_pacific_midnight` moves from `intake/budget.py` into `llm.py`
  (budget already imports `llm`, so the dependency points that way) and
  budget re-imports it.
- **D3: Budget hand-off.** The whole-call ceiling stays at
  `TOTAL_BUDGET_SECONDS = 150`. When the paid link exists, Gemini's share is
  `150 − ANTHROPIC_RESERVE_SECONDS (60)` = 90s, and Haiku gets whatever is
  left, at least 60s. That is well inside the tightest caller wrapper
  (closet opinion `OPINION_BUDGET_S = 240`; the nightly Today job's
  `JOB_MODEL_BUDGET_S = 200` is per run, not per call). Without a key,
  Gemini keeps the full 150s.
- **D4: Nightly job.** An answer from Haiku is a success and does not set
  `budget["failed"]`. No change. Worst case, a nightly run with Gemini
  exhausted costs a few tenths of a cent.
- **D5: Orders** (pending the probe, which may drop models):
  - text: `3.5-flash-lite`, `3.1-flash-lite`, `2.5-flash-lite`,
    `3.6-flash`, `3.8-flash`, `2.5-flash`
  - vision: `3.6-flash`, `3.8-flash`, `2.5-flash`, `3.5-flash-lite`,
    `3.1-flash-lite`, `2.5-flash-lite`

  3.6 goes before 3.8 for vision because 3.6 is measured healthy on photos.
  3.8 is new and, like 3.7 was, likely the most contended. A pinned model
  (`GeminiProvider(model=...)`) still means a chain of one.
- **D6: Provider shape.** `GeminiProvider` keeps the Gemini walk.
  `ChainedProvider(gemini, anthropic)` implements `LLMProvider`: it calls
  Gemini with the reduced budget, and on an `LLMError` that is a
  quota/overload/timeout/budget failure it calls Anthropic. A 400 or a bad
  key is not handed off, because it fails identically on the paid link's
  schema. `build_provider`:
  - `gemini`, no Anthropic key → `GeminiProvider` (as today)
  - `gemini` + Anthropic key → `ChainedProvider`
  - `anthropic` → `AnthropicProvider` on `claude-haiku-5-5`
- **D7: Wording.** The per-day message keeps "per day" and "used up".
  - Its suffix becomes "It resets at midnight Pacific." with no key set,
    and the error is never shown when a key is set, since Haiku answers.
  - If Haiku itself fails after Gemini ran out, the raised error keeps the
    Anthropic SDK's "Error code: …" text, which `_failure_note` already
    reads, prefixed with "Gemini unavailable; ".
- **D8: Logging.** One INFO line per `complete_json`:
  `llm answered by <model> in <s>s (images=<n>); skipped: a(exhausted),
  b(503), c(timeout)`, or `llm failed in <s>s; …` on failure. The
  per-attempt lines move to DEBUG.

## Tasks

All in `backend/`. TDD per task: write the failing test, make it pass, run
`./.venv/bin/pytest tests/test_llm.py` (full suite at the finish gate; one
run at a time, per repo CLAUDE.md). Nothing is parallel-safe: tasks 2–6 all
edit `llm.py`.

1. **Probe script.** `scripts/probe_llm_chain.py` plus a
   `scripts/README.md` entry. It loads `Config` the way
   `record_intake_demo.py` does and calls `models.list`, which uses no
   quota. For each candidate model, it sends one tiny text request with the
   planned `thinkingConfig` and a one-field `responseSchema`, then prints
   the status, the thinking-level acceptance, `quotaId` and `quotaValue` on
   a 429, and the latency. It never prints the key.
   *AC:* the script runs offline in a test with a fake client; it prints a
   per-model table.
   **Joey runs it, or OKs me running it.** It reads the real key and costs
   one request per model from today's free quota. Its output fixes
   `GEMINI_CHAIN`, D1's 2.5 values, and `FREE_TIER_DAILY_REQUESTS`.
   *Tests:* `tests/test_probe_llm_chain.py`.
2. **Chain table and orders.** Replace `GEMINI_MODELS` with a `ChainModel`
   dataclass tuple (`name`, `tier` = lite|flash, `thinking: dict | None`),
   plus `text_order()` and `vision_order()`. Keep `GEMINI_MODELS` as the
   tuple of names for `intake/budget.py` and the tests that import it.
   *AC:* text-only starts on a Flash-Lite model, images start on a Flash
   model, and both orders hold every model.
   *Tests:* new ordering tests; existing tests reworked from the 3-model
   chain to fixtures that set the chain explicitly.
3. **Thinking in the body.** `_build_body(…, model)` adds
   `generationConfig.thinkingConfig` from the entry. A 400 that names
   thinking is retried once on that model without it.
   *AC:* a 3.x body carries the level and a `None` entry carries none; the
   400 retry works and is logged.
   *Tests:* body tests, plus a fake 400 "thinking" response.
4. **Exhaustion memory.** Module-level `_exhausted_until`. A per-day 429
   sets it to the next midnight Pacific (`_next_pacific_midnight` moves here
   from `intake/budget.py`). The walk skips marked models. A per-minute 429
   only falls through. Add an injectable clock and a `reset_exhaustion()`
   for tests.
   *AC:* the spec's two 429 ACs; a model is asked again after midnight
   Pacific.
   *Tests:* clocked tests in `test_llm.py`; `test_intake_budget.py` still
   green.
5. **Retries and budget parameter.** The last Gemini model gets at most one
   retry (0 when a paid link follows). `complete_json` takes an optional
   `budget_seconds` (default `TOTAL_BUDGET_SECONDS`).
   *AC:* at most two attempts per model; the share arithmetic is unchanged
   under the new budget.
   *Tests:* update `test_a_transient_503_is_retried_and_can_succeed` and
   the overload-everywhere tests; add one for a 90s budget.
6. **Paid last link.** `DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"`, add
   `ChainedProvider` and the `build_provider` matrix (D6), plus the wording
   from D7.
   *AC:* the spec's Anthropic ACs (text and image hand-off, no-key wording,
   `LLM_PROVIDER=anthropic` stays Anthropic-only, nothing runs past 150s);
   a 400 is not handed off.
   *Tests:* fake Gemini that exhausts everything, plus a fake
   `AnthropicProvider`; `build_provider` matrix tests; a `_failure_note`
   round-trip test for each raised message.
7. **One log line per call** (D8).
   *AC:* exactly one INFO line per `complete_json` from `llm`, naming the
   answering model, the skipped/failed models and the elapsed time.
   *Tests:* `caplog` tests on success, fall-through, hand-off and total
   failure.
8. **Budget and docs consistency.**
   - Check that `intake/budget.remaining()` is still right for the new
     `GEMINI_MODELS`, using the probe's per-model quota. If quotas differ
     per model, add a per-model dict in `llm.py` and have `remaining()` use
     it.
   - Update `llm.py`'s module docstring and the chain comment with the
     measured facts.
   *Tests:* `test_intake_budget.py` with the new model count.
9. **(carve-out) `render.yaml` comment.** Change "Used only when
   LLM_PROVIDER is anthropic." to say the key also enables the paid
   overflow. This is a comment only and changes no infrastructure, but any
   push to `main` that touches `render.yaml` re-applies the Blueprint.

## Milestones

```
Milestone 1 (auto): task 1, code and tests only
STOP: Joey runs the probe (or OKs me running it) and I record its output
Milestone 2 (auto): tasks 2–8
STOP: carve-out review (render.yaml)
Milestone 3 (auto): task 9
Finish gate → PR
```

If Joey prefers to leave `render.yaml` alone, task 9 is dropped, and the
stale comment is noted in the PR.

## Environment test section

- **Unit:** `cd backend && ./.venv/bin/pytest`, the full suite, once,
  green. The worktree needs its own `.venv` (Python 3.12) or must use the
  main checkout's; to be decided at execution.
- **Live smoke (local, needs real keys, Joey's OK):**
  1. Run the probe script and confirm every chain model returns 200 with
     its thinking config.
  2. Run Discover and closet Today locally and compare Flash-Lite output
     with a pinned 3.6 Flash answer for the same prompt. This answers the
     Flash-Lite ranking question.
  3. Run one shelf photo through intake with `MINIMAL` versus the default
     on 3.6 Flash and compare the detected titles. This answers the photo
     extraction question.
  4. Force the hand-off by marking every model exhausted in a REPL
     (`_exhausted_until`), then run one text and one image call and confirm
     Haiku answers with schema-valid JSON.
- **Post-deploy:** `./scripts/smoke.sh https://joey-haas.dev
  https://api.joey-haas.dev`, then read the Render log for the new
  one-line-per-call entries.
- **Rollback:** unset `ANTHROPIC_API_KEY` on Render to drop the paid link
  without a deploy; revert the PR to restore the old chain.
