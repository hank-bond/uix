---
summary: "Keep each initial Electron workspace window hidden until its manifest-composed surfaces settle their first host render, in three reviewable units: a one-shot host visibility gate, renderer surface-settlement tracking, and failure/documentation verification."
status: active
---

# Workspace first-render gate

## Outcome

A workspace window should become visible with its initial surface composition already rendered, rather than exposing the shell while runtime surface modules are still building, importing, or mounting. Electron creates the workspace window hidden; the renderer reports once the initial surface set has settled; main shows the window after both that report and Electron's own page readiness. The start picker is unchanged.

This is a bounded shell-lifecycle plan, separate from session/history loading. It does not create a public bootstrap snapshot or make the workspace shell understand Chat, agent sessions, models, canvas documents, or any other feature-owned data. Surfaces remain responsible for rendering useful loading states while their own asynchronous data hydrates.

The initial meaning of **surface settled** is deliberately narrow:

> A surface entry from the first accepted composition has committed either its first React presentation or its host-owned error presentation.

A successful component that renders `null`, a loading placeholder, or a Suspense fallback is settled. A surface build failure, dynamic-import rejection, validation failure, or render error is also settled once its error card commits. The gate does not wait for effects, channel requests, images, fonts, session history, model catalogs, or other feature data. A later performance round may revisit this definition from measured behavior; it should not add a surface readiness API before a concrete surface needs one.

## Decisions assumed

- [Runtime surface pipeline](../decisions/2026-07-02-runtime-surface-pipeline.md) — the manifest-derived surface list and each surface's runtime module/error boundary remain the authority on what the workspace mounts.
- [Features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md) — the shell tracks contributed surface entries and never imports or special-cases Chat, Canvas, or another default feature.
- [One owner per state](../decisions/2026-06-09-one-owner-per-state.md) — initial settlement is renderer-derived working state; Electron main alone owns window visibility.
- [Atomic candidates and feature activation](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md) — the initial surface set comes from the accepted workspace generation, including isolated feature failures, rather than a partially adopted manifest candidate.

Implementation follows the [human-paced implementation loop](../architecture/human-paced-implementation.md): land and review one unit at a time.

## Invariants

- Only an initial Electron workspace window is gated. The picker is visible normally, and feature reload never hides an already-visible window.
- Main owns `BrowserWindow.show()`; the renderer can report readiness but cannot directly control host visibility.
- The readiness crossing is cockpit-private typed IPC, not a feature channel or public `@uix/api` capability.
- The renderer reports at most once for one page lifetime, and duplicate reports are harmless.
- Empty surface composition is immediately settled after the empty workspace presentation commits.
- Every failure path eventually becomes visible. A broken page or surface cannot leave the application permanently hidden.
- First render does not become a distributed `Promise.all()` over feature data. Post-render hydration and on-demand requests remain feature-owned.

## R0 — One-shot Electron visibility gate

Create workspace windows with `show: false` and add one window-scoped readiness state in the Electron host. Main shows the window only after both conditions hold:

1. Electron reports that the page is ready to be shown.
2. The workspace renderer reports that its initial surface set settled.

Register the cockpit-private renderer-ready handler before loading the workspace page, make duplicate reports idempotent, and dispose every listener with the window lifetime. Ensure the initial workspace backend and accepted feature generation are queryable before the renderer can request surface composition; renderer startup must not race channel registration or initial feature activation.

Add a bounded fallback beginning from page load. If renderer readiness never arrives, log a structured warning and show the current page rather than leaving an invisible application. Page-load failure follows the same visible-failure principle. Keep the timeout value host-private and conservative; tuning it is not a public contract.

Acceptance:

- A workspace window starts hidden and `show()` occurs exactly once after Electron readiness plus a simulated renderer report.
- Either signal may arrive first.
- Duplicate renderer reports and later reloads do not hide or re-show the window.
- Missing readiness reaches the visible fallback and an attributable diagnostic.
- Closing the hidden window disposes its timeout and listeners.

## R1 — Initial surface settlement tracking

Add one renderer-owned tracker for the first accepted `uix.surfaces` response. It snapshots that composition's surface-entry identities and observes each corresponding `RuntimeSurfacePanel` through the existing runtime load, validation, and error-boundary path.

A surface marks settled only after its body or error presentation commits. Loading states before a module resolves do not count. Build failures already present on `SurfaceEntry`, dynamic-import failures, invalid exports, and render-time failures all converge on the same committed-settlement path instead of maintaining parallel readiness rules. Host-owned style adoption needed for that first presentation must complete before the surface is reported settled.

When every expected entry has settled—or the committed empty-workspace presentation covers an empty composition—the renderer sends the one-shot readiness report. React StrictMode setup/cleanup and repeated surface notifications must not duplicate the semantic signal. Once reported, the tracker is finished for that page lifetime; `/reload` uses normal live reconciliation without participating in first-window visibility.

Acceptance:

- Mixed successful and failed initial surfaces settle only after every visible body/error card commits.
- A slow dynamic import keeps the window gated while already-resolved siblings do not lose their settled state.
- Empty composition settles after its empty presentation commits.
- A component returning `null` counts; feature-owned asynchronous data does not delay settlement.
- StrictMode and duplicate composition notifications still produce one readiness report.
- Reload after readiness neither resets the tracker nor affects visibility.

## R2 — Failure coverage, documentation, and verification

Exercise the complete host/renderer handshake with focused tests around the pure settlement state, renderer mounting, and the Electron visibility coordinator. Include successful, empty, mixed-failure, never-settled, duplicate-signal, close-before-ready, and reload-after-ready cases. Verify manually in development that a normal workspace appears fully composed and a deliberately broken surface appears as an error card rather than leaving the window hidden.

Update the architecture-of-record and shipped surface documentation with the implemented first-render behavior. Document the exact current settlement definition and the distinction between host readiness and feature-owned data hydration. Run focused tests followed by the full repository check.

Acceptance:

- Tests cover every invariant above without requiring feature code to call a readiness API.
- Current architecture and user-facing surface docs match the shipped behavior.
- Normal and broken-surface manual checks both reach a visible workspace.
- `npm run check` passes.

## Boundary / later

- No session/history, model, provider, canvas-document, or feature-setting request joins the first-render gate.
- No aggregate workspace bootstrap payload or public surface readiness callback.
- No waiting for arbitrary React effects, network quiet, images, fonts, animations, or Suspense content beyond the first committed fallback/presentation.
- No progress UI, startup telemetry dashboard, or performance budget in this plan.
- No re-gating on feature reload, workspace data refresh, or session switch.
- A later measured performance round may change which host-owned work precedes the signal, add startup timing instrumentation, or introduce an explicit surface readiness contract if real surfaces cannot provide an acceptable first committed presentation without one.
