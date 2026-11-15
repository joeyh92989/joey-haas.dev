---
title: A deploy hook for the wrong service still answers 2xx
date: 2026-11-15
tags: [render, ci]
---

The deploy hook I had set for the API was the static site’s hook. A dry run of the workflow reported success, because the hook answered 2xx, but the API never rebuilt. I only caught it by opening Render’s deploy list for each service and seeing nothing new on the API.

A hook doesn’t know which service you meant to hit. It accepts the request and starts a deploy for whatever service it belongs to, so the status code says nothing about the API.

Two changes came out of it:

- The workflow now checks that the hook URL names the API’s service id before it calls it.
- A deploy counts as done when the live commit changes, read from the API’s version endpoint, and never because the hook returned a good status.
