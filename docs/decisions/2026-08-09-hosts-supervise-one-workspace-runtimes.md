---
summary: "The host owns process and platform integration, exposes a launcher, and supervises zero or more workspace runtimes through local or proxy workspace handles. Each WorkspaceRuntime owns exactly one workspace and its agent instances. An app is a host plus an explicit composition."
kind: explanation
status: superseded
---

# Hosts supervise one-workspace runtimes

> **Superseded in part by [host-workspace-runtime-boundaries](../design/host-workspace-runtime-boundaries.md).** The proxy handle and process isolation are removed from the host model. The runtime is in-process by construction, so the host-facing shape has one implementation. The host, supervisor, workspace-runtime, dependencies, launcher, and app conclusions stand.

## Context

The Electron/server split needs concrete hosts, shared substrate packages, and explicit workspace compositions to be distinct from the start. The earlier transport-first attempt let Electron's global handler and broadcast model shape the runtime contracts before host, workspace, attachment, and client ownership were clear.

## What changes

- A **host** owns process and platform integration: lifecycle, transports, native capabilities, and workspace supervision. Electron and the local server are hosts.
- A **supervisor** inside the host maps workspace ids to workspace handles, coalesces runtime boots, holds workspace retention, and decides process placement and teardown. A local handle wraps an in-process runtime. A proxy handle routes to a runtime in another process. Both share one host-facing shape.
- A **WorkspaceRuntime** owns exactly one workspace: its lifetime bag, feature composition, stores, registries, and agent instance manager. Disposing one runtime cannot remove another runtime's channels, resources, features, or process bindings.
- The runtime declares its **dependencies**, and the host provides them: channel transport, resource delivery, `openExternal`, the Pi profile directory, and the API module directory. An **adapter** translates across communication capabilities.
- A **launcher** exists above all runtimes. A host can serve the launcher with zero active workspace runtimes and create one only when a connection acquires it. The launcher projects workspace ids, names, canonical URLs, and later session summaries through one versioned catalog.
- An **app** is a distributable host plus an explicit workspace and feature composition. Hosts do not silently install app features. The repository keeps `packages/`, `hosts/`, and `apps/` roots distinct from the beginning. This supersedes the App-vocabulary and one-workspace-scoping portions of [`2026-07-02-workspace-manifest-not-discovery.md`](./2026-07-02-workspace-manifest-not-discovery.md), which named App as the running Electron application. The manifest-not-discovery conclusion stands.
- A **client bootstrap** is a host's page entry that constructs the transport client and mounts the shared client. Shared client code never detects Electron globals or selects a transport itself.

## Why this shape

A multi-workspace `Runtime` container was rejected because process placement, boot coalescing, and workspace teardown are host policy, not workspace semantics. Keeping `WorkspaceRuntime` exactly-one-workspace preserves bag-based teardown isolation. One host can keep several runtimes in one process or isolate them across processes without changing the runtime.

The launcher was rejected as a workspace-runtime capability because it must exist before any workspace loads. It serves clients such as the web launcher, CLI JSON, and the native launcher. Host-owned capability endpoints answer which workspaces and sessions a server exposes.

The shared Pi profile conclusion from [`2026-07-11-app-owned-pi-profile.md`](./2026-07-11-app-owned-pi-profile.md) survives as a host-injected dependency: the host decides the profile location and provides it to every workspace runtime.

## Distilled from

[`host-workspace-runtime-boundaries.md`](../design/host-workspace-runtime-boundaries.md) and [`product-and-distribution.md`](../design/product-and-distribution.md). Built by [`electron-server-split.md`](../../plans/electron-server-split.md).
