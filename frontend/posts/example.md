---
title: Example post
date: 2026-08-30
tags: [meta]
draft: true
---

This file documents the frontmatter contract and is never published. Copy it to
start a real post, then set `draft: false`.

DRAFTONLYMARKER — the smoke test asserts this string is absent from the
production bundle.

## Formatting

Standard markdown works, plus GitHub-flavored tables and strikethrough.

| Field   | Required |
| ------- | -------- |
| `title` | yes      |
| `date`  | yes      |

Code blocks are highlighted at build time:

```python
async def health() -> dict:
    return {"status": "ok"}
```
