---
title: Guard state-dependent writes on the server
date: 2026-11-12
tags: [api, concurrency]
draft: true
---

The Remove button for a photo was disabled in the client whenever the photo was in the `reading` state. It looked like a guard, but it almost never fired.

The server marks a photo as `reading` before the client finds out. By the time the browser knew the state, the write had usually been sent already, so the button was live at the moment it mattered. The whole-branch review caught it.

A client only sees the state the server last told it about, so it can’t guard against a claim the server made a moment ago.

The check belongs on the server. Lock the row, read its current state, and answer 409 if it has been claimed. The write is then safe whatever the client showed.

The client check is still there, but only as a hint in the interface.
