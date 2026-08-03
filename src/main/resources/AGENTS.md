---
summary: "The main-process resource registry resolves feature routes, dispatches validated resource URLs, and owns one replaceable custom-protocol transport lifetime."
status: active
---

# Resource registry

This directory owns live feature resource routes and dispatch over the substrate resource transport. Shared route declarations, URL codecs, and feature-author contracts remain under `src/api/`; the registry defaults to Electron's custom-protocol adapter.

Apply these invariants when changing this boundary:

- Register the privileged resource scheme before Electron becomes ready.
- Treat scheme-level CORS support as transport permission, not a response grant; each resource handler still controls its response headers.
- Decode path parameters and query values before invoking feature handlers.
- Return a validation failure as 400 when a candidate resource route recognizes a malformed URL; return 404 when no route matches.
- Reject canonical resource-id collisions until the owning contribution lifetime disposes.
- Register grouped resource contributions atomically so one failure removes earlier routes.
- Dispose the application-wide transport handler only with the registry, not with one feature route.

## Contents

<!-- INDEX:START -->

<!-- Generated from source-file summaries, local Markdown frontmatter, and child AGENTS.md summaries. Do not edit by hand; run `npm run docs:index`. -->

### Source files

- **[registry.test.ts](./registry.test.ts)** Verifies protocol privileges, route dispatch, validation status, collision rollback, grouped lifetimes, and transport disposal.
- **[registry.ts](./registry.ts)** Owns live feature resource routes and dispatches validated resource URLs through one protocol transport.

<!-- INDEX:END -->
