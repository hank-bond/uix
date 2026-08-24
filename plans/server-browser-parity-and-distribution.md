---
summary: "Add reconnect recovery, full browser parity, explicit app ownership, local operations, safety review, and independent distribution to the minimal server."
---

# Server browser parity and distribution

## Status and dependency

This plan follows the minimal web vertical in [Electron and server hosts](./electron-server-split.md). The first web host intentionally supports a smaller product envelope. It has one visible session target per page, no running-session switch, and no background-run recovery promise. It remains loopback-only without full provider-auth parity.

Agent feature isolation, concurrent session viewpoints, and selected-view Canvas behavior land independently in [agent feature instances and viewpoint state](./agent-feature-instances-and-viewpoint-state.md). Runtime shutdown hardening lands in [runtime operation hardening](./runtime-operation-hardening.md).

## Review units

### P1: Reconnect and snapshot recovery

Give the shared client a connection epoch and one reusable snapshot-recovery pattern. Classify every event stream as a durable snapshot signal, ordered live delta, or explicitly lossy notification. Pending mutations become indeterminate after connection loss and never retry automatically.

**Review gate:** Reload and reconnect recover every snapshot-backed projection without remounting the entire client or duplicating mutations.

### P2: Full reference-app browser parity

Complete browser behavior for feature reload, Canvas writeback, settings, keybindings, session switching, provider authentication callbacks, persistence, and model controls. Preserve intentional host differences rather than hiding them behind inaccurate adapters.

**Review gate:** The reference workspace behaves consistently in supported browsers and Electron under the shared semantic suite.

### P3: Explicit app and workspace ownership

Move reusable Chat, Canvas, workspace tools, and other app features under `apps/features`. Move the dogfood manifest and workspace-specific source under `apps/workspaces/default`. Update scaffolding so runtime and hosts build without importing the reference application.

**Review gate:** Bare workspaces activate without app features, while the default app remains an explicit readable manifest composition.

### P4: Launcher, CLI, and local operations

Expose the launcher/catalog projection through versioned HTTP and stable CLI JSON. Add address advertisement for a future native launcher. Settle startup URLs, loopback binding, port selection, browser opening, logs, signals, profile locations, and stale advertisement recovery.

**Review gate:** CLI and HTTP projections agree, and local discovery recovers from stale process state.

### P5: Safety and independent distribution

Review Content Security Policy, Cross-Origin Resource Sharing, iframe origins, generated-content containment, path traversal, cache behavior, and production asset layout. Complete the local-server threat review before any non-loopback binding.

Build Electron and server independently. Complete Node single-executable packaging without pulling Electron or app features into the core server artifact. Run the parity matrix on macOS and a Linux or container-like environment.

**Review gate:** Both hosts package independently, the loopback safety model is documented, and the server artifact contains no Electron or implicit app composition.

## Deferred

- Remote identity, tenancy, authorization, and collaboration.
- Non-loopback operation before a separate security model.
- Native launcher UI.
- Fruition onboarding, subscriptions, installers, and updates.
- Independent publication of internal packages unless distribution requires it.
