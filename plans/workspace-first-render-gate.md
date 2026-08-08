---
summary: "Show a substrate-owned loading overlay while the accepted initial feature composition restores and renders underneath it. Reveal the workspace after restoration and first surface presentation settle."
status: stub
---

# Workspace loading overlay

## UX expectation

Opening a workspace immediately shows a substrate-owned loading overlay. The accepted feature surfaces render underneath it, but the covered workspace is not interactive.

Feature activation and the auth-free selected-session manager may begin in parallel. Selected-branch turn-state restoration waits until feature activation has settled so the active cells, schemas, and restore callbacks are known. Feature surfaces mount after restoration.

The overlay leaves only after:

- feature activation has settled, including isolated feature failures.
- selected-branch turn-state restoration has settled. And
- every initial surface has committed either its first presentation or its error presentation.

A first presentation may itself be a feature-owned loading state. The substrate does not wait for arbitrary feature data, effects, images, or other open-ended asynchronous work.

This is an initial workspace-opening experience. Plan detailed lifecycle, failure, timeout, accessibility, and Electron/browser host mechanics before implementation.
