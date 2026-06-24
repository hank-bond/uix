---
summary: "Build the Host→Workspace runtime boundary before surface contributions: introduce a web-compatible Workspace iframe, bridge it to backend substrate through request/event channels, then move chat and canvas in as default feature surfaces without hardcoding them in Host."
read_when: "Read when resuming canvas/chat featurification after the Host/Workspace design discussion, especially before adding renderer surface contributions or changing App.tsx."
status: active
---

# Workspace runtime foundation

## Context snapshot

We pivoted from "pane contribution in the cockpit renderer" to **Host → Workspace → Surface**. Host is the embedding layer: Electron desktopification now, web/page/server shell later. Workspace is the web-compatible app runtime hosted inside a Host-owned iframe. Surfaces live inside Workspace: shadow surfaces are trusted reusable feature UI, iframe surfaces are stronger nested containment for imported/generated/runtime-isolated UI. Backend substrate owns agents, documents, resources, channels, durable state, and rehydration.

Chat and canvas are default features, not core app structure. Chat is a naive surface over a linked agent connection: it sends prompts and renders transcript/events using the same agent/bus API other features can use. Canvas is a feature with document resources, channels, tools, state, state messages, and UI; authored canvas HTML remains iframe-contained because canvas needs document/style/origin isolation.

Current main-process featurification is in good shape. `FeatureDefinition` exists with `preflight` plus `contribute(ctx)`. Bundled features are inventoried via `src/main/features/bundled.ts`. Resource preflight/runtime contributions exist; the old direct `registerCanvasProtocol(...)` path was removed in `eeee218 Extract resource contributions`. Canvas main/runtime contributions now come through `canvasFeature` rather than `main/index.ts` naming canvas internals.

A renderer-side `SurfaceHost` stepping stone was tried and reverted because it hosted surfaces directly in the Host renderer, which points away from the agreed target. Do not reintroduce direct-in-Host surfaces unless explicitly chosen as temporary debt. The next implementation should establish the Workspace iframe boundary first.

## Decisions to preserve

- Use **Host**, not cockpit, for the outer embedding/runtime shell vocabulary.
- Use **Workspace** for the composed app runtime: enabled features, surface layout, feature-agent links, and workspace bus client.
- Use **Surface** for visible feature UI areas inside a Workspace. Avoid `pane` as the public concept for now; it is too form-specific.
- A surface contribution declares that a visible surface exists; workspace/layout state decides order, size, focus, visibility, and later persistence.
- Shadow and iframe surfaces are both supported concepts, but they are not naively swappable modes. Shadow is cooperative/reusable trusted code; iframe is a containment boundary with an extra bridge hop.
- One logical backend-routed communication path is the durable/agent-relevant/inter-feature path. Model it as channel **requests** plus channel **events** rather than a WebSocket-first bus: Workspace→backend operations are REST-like request/response calls; backend→Workspace notifications are SSE-like event subscriptions. Shadow surfaces call the Workspace channel client directly; nested iframe surfaces proxy via `postMessage` to the same client. Ephemeral UI-only coordination may remain local inside Workspace later.
- Backend routing matters because backend owns durable feature state, agent context, transcript/custom messages, rehydration, resources, and document stores.
- Feature boundaries still matter in shadow mode for reuse/composition, like React component libraries but with UIX facets: UI surfaces, resources, channels, state, tools, docs, and default config.
- Keep UI under Workspace web-compatible: no Electron imports/preload assumptions in Workspace runtime code once the bridge exists.
- The `channels` facet is the declarative communication facet. Contributions declare request handlers and event schemas; runtime code imperatively calls requests from surfaces and publishes events from backend feature code.
- Prefer typed facet clients over raw stringly transport in feature/surface code. The raw request/event pipe is Host/Workspace transport plumbing; feature-owned SDKs can later wrap generated/scoped clients into ergonomic methods such as `canvas.writeback(...)` and `canvas.onChanged(...)`.

## Step plan

### W0 — Commit documentation checkpoint

Commit the updated design thread and this plan before implementation. Relevant docs: [workspace-feature-composition](../design/workspace-feature-composition.md) and this plan.

### W1 — Add a Workspace API wrapper, no iframe yet

Introduce a small renderer-side API module used by current Chat/Canvas instead of direct `window.uix` calls. Initially it delegates to `window.uix` so the app still works unchanged. This creates the seam that can later switch to a postMessage proxy inside the Workspace iframe.

Candidate internal transport shape:

```ts
workspaceClient.requests.call(...)
workspaceClient.events.subscribe(...)
```

Candidate facet/client shape used by current components:

```ts
agentClient.sendPrompt(...)
agentClient.onEvent(...)
agentClient.getHistory(...)
canvasClient.writeback(...)
canvasClient.onChanged(...)
```

Do not put canvas on the core Workspace API. Canvas-specific methods belong to a canvas-owned client/facet wrapper over the scoped channel client. Start by wrapping current calls: prompt/history/agent events/canvas changed/canvas writeback/refresh.

### W2 — Split Host and Workspace frontend entries while keeping behavior unchanged

Create separate frontend entrypoints/files for Host and Workspace, but do not switch the running app yet. The current UI becomes `Workspace` code. Host remains able to render the old app path until the bridge is ready.

Likely files:

```text
src/renderer/host/Host.tsx
src/renderer/workspace/Workspace.tsx
src/renderer/workspace-main.tsx
src/renderer/workspace.html
```

Update `electron.vite.config.ts` to build both renderer HTML entries if needed. Keep all checks green and the launched app functional.

### W3 — Host renders Workspace iframe and bridges current API

Switch Host to render a Workspace iframe. Implement request/response correlation and event forwarding over `postMessage`:

```text
Workspace iframe -> Host renderer -> preload/window.uix -> main/backend
main/backend events -> preload/Host renderer -> Workspace iframe
```

At the end of W3, current Chat and Canvas should still work, but they run inside the Workspace iframe and use the Workspace API proxy rather than direct preload access.

### W4 — Add surface layout inside Workspace

Only after W3, add the surface contribution/layout layer inside Workspace, not in Host. Start minimal:

```text
Workspace
  SurfaceLayout
    chat shadow surface
    canvas shadow surface wrapper, with authored HTML iframe inside canvas
```

The layout can preserve today’s two-column grid. Naming should use `SurfaceLayout`, `SurfaceFrame`, or `SurfaceMount`, not `SurfaceHost`, to avoid confusing it with Host.

### W5 — Make chat and canvas default feature surfaces

Move hardcoded Workspace rendering to bundled/default surface contributions. Chat and canvas should be contributed surfaces, but still use existing functionality internally. This step removes direct chat/canvas mounting from Workspace without changing behavior.

### W6 — Evolve Workspace API toward typed facet clients

Replace legacy-shaped wrapper methods with typed clients derived from declared facets. The underlying Workspace/Host transport remains generic request/event plumbing, but feature/surface code should normally use scoped clients:

```ts
ctx.feature.requests.writeback(...)
ctx.feature.events.changed.subscribe(...)
agentClient.sendPrompt(...)
resourceClient.url(...)
```

Feature-owned SDKs can wrap those generated/scoped clients into ergonomic methods:

```ts
canvas.writeback(...)
canvas.onChanged(...)
```

This is where channel declarations become the source of truth for validation, bridge routing, docs, and typed clients, but only once the bridge exists and real surfaces are inside Workspace.

### W7 — Later cleanup

Derive canvas open keys from visible Workspace surfaces instead of the transitional `openCanvasKeys = ["main"]`. Add feature-agent link metadata and link/unlink transcript messages. Add locks/concurrency only when multi-agent or concurrent feature mutation becomes real.

## Validation rhythm

For each step: plan with the user, implement one small chunk, run typecheck/lint/format/docs checks plus targeted tests, stop for review, and commit only after explicit approval.
