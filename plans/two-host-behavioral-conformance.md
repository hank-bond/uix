---
summary: "Drive real Electron and server hosts through shared scenarios, recording differences before planning parity work."
---

# Two-host behavioral conformance

## Purpose

Establish what user-visible behavior actually differs between Electron and the web host. This plan supersedes P2 of the retired [server browser parity and distribution](./archive/server-browser-parity-and-distribution.md) plan. It does not assume that parity work exists before the harness demonstrates a gap.

The first H8 attempt in [Electron and server hosts](./archive/electron-server-split.md) normalized fake runtime and host adapters behind a test-owned contract. It was removed because it could pass without exercising real preload, process, renderer, protocol, resource, or packaging paths. The replacement launches the actual hosts and drives their production clients.

The existing Lightpanda suite remains a useful server smoke test. It does not establish two-host conformance: its styleless Chat fixture bypasses the complete reference surface, and Lightpanda cannot complete Canvas cross-frame writeback.

## Rules

- Launch built Electron and server hosts as separate real processes.
- Use isolated manifests, workspace state, Pi profiles, and process output for each run.
- Share behavioral scenarios and expected outcomes, not fake host or runtime implementations.
- Keep host drivers limited to physical launch and interaction mechanics.
- Assert through user-visible state, public host boundaries, and durable artifacts.
- Record intentional differences explicitly instead of normalizing them behind inaccurate adapters.
- Keep focused unit tests for transport, lifetime, validation, and failure edge cases.
- Add an implementation task only after a scenario exposes a real unsupported behavior.

## Review units

### C1: Prove one scenario through both real hosts

Choose a browser automation driver that can exercise production Chromium behavior and Electron. Replace no production boundary and add no test-only runtime capability. Launch both built hosts over the same minimal fixture workspace, mount an ordinary feature surface, perform one channel-backed mutation, and verify the resulting durable state.

The unit owns deterministic process startup, readiness, diagnostics, timeout, and cleanup. It must demonstrate that a failing production host path fails the scenario rather than being hidden by orchestration.

**Review gate:** One shared scenario passes through the actual Electron preload/IPC path and the actual server HTTP/WebSocket path. Both runs clean up their processes and isolated state on success and failure.

Stop for review before C2.

### C2: Measure reference-workspace behavior

Extend the scenario inventory only across behavior the reference composition currently exposes. Cover representative surface loading and reload, typed request/event delivery, workspace settings, and keybindings. Also cover sessions, transcript recovery, Canvas iframe writeback, and model/provider controls that can run deterministically through production boundaries.

For every scenario, classify the result as:

- conforming in both hosts
- an intentional host-specific difference
- an observed implementation defect

Keep browser-history and native-window behavior host-specific where their user outcomes cannot be identical. Do not force external provider networks or nondeterministic model inference into the required suite.

**Review gate:** The checked-in result identifies supported shared behavior and intentional differences. Every discovered defect has a focused reproduction and may be promoted into its own implementation plan or backlog seed.

## Deferred

- A third in-memory host adapter or synthetic runtime.
- Pixel-level visual regression testing.
- Live third-party provider and model conformance.
- A broad cross-platform matrix beyond the first reliable Electron/browser environment.
- Packaging and installer verification.
