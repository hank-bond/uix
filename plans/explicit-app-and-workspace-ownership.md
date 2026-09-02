---
summary: "Move first-party features and the dogfood workspace into explicit app-owned roots so hosts and substrate packages contain no implicit application composition."
---

# Explicit app and workspace ownership

## Purpose

Complete the source-ownership migration already represented by `apps/features` and `apps/workspaces`. Chat, Canvas, workspace tools, and the repository dogfood manifest are ordinary application composition, not substrate or host defaults.

This plan preserves P3 from the retired [server browser parity and distribution](./archive/server-browser-parity-and-distribution.md) plan. It is independent of host parity and distribution.

## Review unit

### A1: Move the reference application

Move reusable Chat, Canvas, workspace tools, and their tests from `src/features` to `apps/features`. Move the dogfood manifest and workspace-specific source under `apps/workspaces/default`. Update manifest references, server registry fixtures, scaffolding, build inputs, tests, and documentation in the same breaking migration. Keep no compatibility paths or duplicate source roots.

Hosts continue to compose only shared host, runtime, and browser-client packages. They may receive an explicit manifest or registry entry selecting the reference app, but must not import or install app features themselves. Bare workspace scaffolding continues to copy only its editable Pi tool providers.

**Review gate:** The Electron and server hosts and all substrate packages build without importing `apps`. The default workspace remains an explicit readable manifest composition, bare workspaces activate without first-party app features, and all repository checks pass.
