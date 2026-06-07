---
summary: "Archived build spec for the raw HTML canvas pane."
read_when: "Read only for historical context on the canvas pane stages superseded by later decisions and design threads."
status: archived
---

# Spec: raw HTML canvas pane (archived)

> **Archived 2026-06-02.** Stage 1 shipped and is recorded in [`../decisions/2026-05-31-canvas-stage-one.md`](../../decisions/2026-05-31-canvas-stage-one.md). The Stage 2–3 material below is retained as historical planning context only; the current bidirectional follow-on is tracked in [`../../design/canvas-data-channel.md`](../../design/canvas-data-channel.md) and should get a fresh plan before implementation.
>
> Original framing: the next unit after the extension loader. Gets agent-authored HTML onto the screen and, in later stages, makes it a stateful surface whose source of truth is the file on disk.
>
> Read [hosting-compatible-by-default](../../decisions/2026-05-31-hosting-compatible-by-default.md) first — it constrains this work (address by key not path, cockpit is sole writer, no `fs.watch`, content-hash echo suppression, field-level merge). This spec assumes those decisions.

## The model (all stages)

A **canvas** is an HTML document addressed by a **canvas key**. A key is an S3-like slash-namespaced slug such as `main`, `reports/security-review`, or `apps/demo-dashboard/v1`. The agent never addresses a filesystem path; it reads and writes canvas keys through dedicated canvas tools. The local Stage-1 store persists those keys at `<project>/.uix/canvas/<key>.html`, but that path mapping is an adapter detail and may later become a DB row, object-store key, or remote document.

The canvas document is the **source of truth**; the cockpit is its **sole writer** (agent through canvas tools, cockpit writeback later — no external-editor support, so no `fs.watch`).

The cockpit shows a canvas in an **own-origin sandboxed iframe**. Own origin is the load-bearing security decision: agent HTML must never reach `window.uix` or the cockpit DOM. So content is served from a custom protocol and loaded via `src` — **never `srcdoc`** (srcdoc inherits the parent origin and reopens the hole).

Three stages, each shippable:

1. **Display** — agent writes a canvas key through the canvas tool → visible page; updates on agent rewrite. No shim, no state, no interaction.
2. **Writeback** — injected shim captures `[name]` field edits → debounced flush to disk. State survives reload because the file holds it.
3. **Interaction** — agent-authored actions (buttons etc.) routed through the typed channel.

Stages 2–3 are sketched for direction only. **Implement Stage 1, then stop and reconvene** — 2 will be replanned against real friction.

---

## Stage 1 — Display (implement this)

### Goal

The agent writes canvas key `main`; it renders in the canvas pane. When the agent rewrites the key, the pane re-fetches and shows the new content. No state, no shim, no writeback, no interaction.

### Design

**Content store (main), addressed by key.** New module `src/main/canvas/store.ts`, the **only** path-aware code:

```ts
canvasDir(): string                                  // <cwd>/.uix/canvas
isCanvasKey(key: string): boolean                    // slash-namespaced slug
readCanvas(key: string): Promise<string | null>      // null if absent/invalid
writeCanvas(key: string, html: string): Promise<void>
```

Validate keys against `^[a-z0-9-]+(?:/[a-z0-9-]+)*$`. The local adapter maps `<key>` to `<canvasDir>/<key>.html`, creating namespace directories as needed. Bad keys return `null` from reads; writes reject so nothing can escape the canvas store. Canvas tools should reject invalid keys with an actionable message to the agent that explains the format: lowercase slug segments `[a-z0-9-]+`, optionally separated by `/` (examples: `main`, `reports/security-review`). Keep `canvasDir()` here, not in `extensions/roots.ts` — that file is about extension discovery; path resolution for canvases belongs with the store.

**Own-origin protocol (main).** New module `src/main/canvas/protocol.ts`. Serves `readCanvas(<key>)` at a deterministic host derived from the key. Key segments are reversed into host labels so the full key participates in the origin while the URL path remains free for Stage 3 fragments:

```text
main                       -> uix-canvas://main/
reports/security-review    -> uix-canvas://security-review.reports/
apps/demo-dashboard/v1     -> uix-canvas://v1.demo-dashboard.apps/
```

Each key is therefore its own stable origin, isolating canvases from each other as well as from the cockpit. Requirements:

- A top-level `protocol.registerSchemesAsPrivileged([...])` call that runs at **module load, before `app.whenReady`** (Electron requires this). `index.ts` must import this module before ready for the side effect to land in time. Mark `standard: true` (gives it a real origin: same-origin to itself, cross-origin to the cockpit), `secure: true`, `supportFetchAPI: true` (Stage 2 shim will need it).
- A `registerCanvasProtocol(): Disposable` called after ready that wires the handler via `protocol.handle` and returns the unregister Disposable (enrolled in `appBag`). Return HTML with `Content-Type: text/html` and `Cache-Control: no-store`; on `null` return a 404 with a tiny placeholder body (the pane renders it as-is — a missing canvas is a normal empty state, not an error). Use a minimal inline placeholder for now, e.g. `No canvas yet: <key>`; richer empty-state buttons for templates/docs can come later. Canvas refreshes are infrequent whole-document swaps; the store is truth and stale protocol caching is not useful.

**Canvas tools (main / agent binding).** Stage 1 should not infer canvas writes from generic filesystem tools. Canvas is core substrate wiring, not a user extension, so it binds its agent-facing surface through an internal `AgentBinding` gathered by the agent subsystem:

```ts
// src/main/agent/bindings.ts
interface AgentBinding {
  tools?: ToolDefinition[];
  // Later: system prompt sections, hooks, message transforms, context, etc.
}
```

The canvas binding contributes dedicated tools to the single UIX-owned agent session:

```ts
uix_canvas_read({ key: string });
uix_canvas_write({ key: string, html: string });
```

`uix_canvas_read` returns the raw authored HTML for the key, with no wrapper. Stage 1 has no separate metadata response; if the document needs author-owned metadata, use normal HTML mechanisms such as `<title>` / `<meta>` for now. Later storage metadata (hashes, snapshots, versions) can be added to tool result details or separate APIs without changing the authored HTML contract.

`uix_canvas_write` is the canonical Stage-1 writer. It validates the key, writes through `writeCanvas`, emits `canvasChanged { key }`, and returns a short acknowledgement. This is the callback seam for later snapshots, hashes, validation, and hosted storage; the agent never needs to know whether the backing store is a file. When line-hash/delta writes land, write responses should include the updated line hashes for affected lines; Stage 1 does not implement deltas.

**Canvas-changed signal (main → renderer).** The pane needs to know when to re-fetch. The Stage-1 writer is `uix_canvas_write` — **not** the filesystem and not generic pi file-write events.

- Add to `src/shared/ipc.ts`: a `canvasChanged` channel (main→renderer `send`) and a `{ key: string }` payload; extend the preload bridge with `onCanvasChanged(handler)` mirroring `onAgentEvent`. Build this part **first** — it's the durable seam for tool writes and later writeback.
- Broadcast `canvasChanged` to all live cockpit windows. Stage 1 has one app per window, so this is equivalent to sending to the current window; the broadcast shape is the future-compatible outer delivery mechanism. Pane/app/tab-level opt-in, dirty marking, and cold/warm lifecycle policy stay in the renderer.
- Optional dev fallback: register an invoke-style manual refresh endpoint (via `handle`, into `appBag`) that validates a key and sends `canvasChanged`. This is only for dogfooding hand-edits; it is not the canonical agent path.

**Canvas pane (renderer).** New `src/renderer/Canvas.tsx`. Replace the placeholder block in `App.tsx` (the `.uix/canvas/main.html will render here` section) with `<Canvas canvasKey="main" />`. Hardcode `canvasKey="main"` for now.

- Renders `<iframe src="uix-canvas://main/?v={token}" sandbox="allow-scripts allow-same-origin">`. The pairing looks alarming (`allow-scripts` + `allow-same-origin` normally lets content break its own sandbox) but is **safe here precisely because the origin is the canvas's own, not the cockpit's** — "same-origin" means same as the canvas, which holds nothing privileged. This is the whole reason for the custom protocol. Leave a comment saying so; it will be questioned.
- Subscribe to `window.uix.onCanvasChanged`; when the key matches, bump `token` (a monotonic counter; not `Date.now()` — two refreshes in the same ms must differ) to force a re-fetch. Whole-document swap via re-pointing `src` — no DOM patching.

  > `// TODO: hardcoded pane — becomes a registered iframe pane when the pane host + registerPane contribution land.`

### Out of scope (Stage 1)

Shim, `postMessage`, writeback, `[name]` capture, interaction, htmx, fragment/partial updates, `registerPane`, multiple canvases, `fs.watch`.

### Files

- `src/main/canvas/store.ts` — `canvasDir()` + key validation + `readCanvas(key)` + `writeCanvas(key, html)`; the only path-aware code.
- `src/main/canvas/protocol.ts` — top-level `registerSchemesAsPrivileged`
  - `registerCanvasProtocol(): Disposable`.
- `src/shared/ipc.ts` — `canvasChanged` channel + `{ key }` payload + bridge method (build first).
- `src/preload/index.ts` — `onCanvasChanged`; expose `window.uix` only in the main frame so agent-authored canvas iframes never receive the bridge.
- `src/main/agent/driver.ts` — current agent driver/session lifecycle (`src/main/agent.ts` moves here).
- `src/main/agent/bindings.ts` — internal `AgentBinding` type + aggregation for UIX-owned agent capabilities (tools in Stage 1; prompt sections/hooks/ transforms later).
- `src/main/canvas/agent-binding.ts` — canvas agent binding; contributes `uix_canvas_read` / `uix_canvas_write`; write emits `canvasChanged`.
- `src/renderer/Canvas.tsx` — the pane.
- `src/renderer/App.tsx` — swap placeholder for `<Canvas canvasKey="main" />`.
- `src/main/index.ts` — import `protocol.ts` **before** `app.whenReady` (for the eager `registerSchemesAsPrivileged`); call `registerCanvasProtocol()` after ready into `appBag`; manual refresh IPC if used.

### Verification (dogfood)

1. `npm run dev` with no `.uix/canvas/main.html` present — pane shows the empty-state placeholder (404 body), no crash.
2. Ask the agent to write canvas key `main` with a heading using the canvas tool; it renders. If dogfooding by hand, create `.uix/canvas/main.html` and trigger the optional manual refresh.
3. Rewrite the key through the canvas tool and refresh again. Pane shows new content; **the cockpit window does not reload** and the conversation pane is untouched (proves this is content refresh, not extension/window reload).
4. Confirm isolation: in the iframe's devtools context, `window.parent.uix` is `undefined` (cross-origin throws/blocks).
5. `npm run check` passes.

### Logging

`canvas` component in the main process (snake_case, past tense): `canvas_served {key}`, `canvas_not_found {key}`, `canvas_changed {key}`. Stage 1 does not add renderer-to-main log forwarding; these events all occur naturally in main. Do not expose any logging bridge to agent-authored canvas iframes.

### Docs

Update `src/docs/panes.md` (currently a stub) with the iframe-pane + own-origin model. Record a decision under `docs/decisions/`: own-origin protocol (not `srcdoc`), store-by-key, whole-doc swap, dedicated canvas tools as the write seam (no generic file-write inference, no `fs.watch`), hardcoded-pane deferral of `registerPane`.

---

## Stage 2 — Writeback (sketch; replan before building)

Make the canvas stateful with the file as truth.

- **Inject the shim** at serve time in `protocol.ts` (a `<script>` tag; never written to disk). The shim runs inside the iframe.
- **Capture:** shim finds `[name]` elements, listens for `input`/`change`, `postMessage`s `{ name, value }` to the parent. Naming discipline: every interactive element gets a unique `name`; radio groups share a name, value discriminates.
- **Renderer ↔ iframe** `postMessage` hop appears here (Stage 1 has none).
- **Writeback channel** (renderer → main → `writeCanvas(key, html)`): parse5 sets `value`/`checked`/`selected` on existing named elements, structure untouched.
- **Flush cadence:** debounced `input` (crash insurance) + flush on blur (natural boundary) + **drain before teardown** (the cockpit-initiated reload case — ask the iframe for current values before disposing).
- **Echo suppression:** content-hash — remember what we wrote, ignore the matching change-feed event; don't re-render from changes that originated in the live pane.
- **Conflict:** field-level merge — on agent rewrite, swap structure but re-apply unflushed user `[name]` values.
- **No localStorage** — file holds the state; capture shim is ~vanilla DOM; htmx adds nothing to capture.

## Stage 3 — Interaction (sketch)

Agent-authored actions that _do_ something (trigger a turn, run a command). **Open decision** (see `docs/architecture/open-questions.md`): agent interaction/update vocabulary — candidates: custom `data-uix-*` attrs vs htmx-as-vocabulary (htmx's swap/event engine, but routed through our channel, **not** htmx-as-HTTP-transport, which collides with the landed typed-channel decision). Hard constraint: interaction must route through the typed channel and be able to express `local`/`silent`/ `turn` modes. CSS stays agent-raw (iframe-scoped, no transport implications). Decide against a concrete interaction, with htmx as the leading candidate. This is also where fragment/partial updates (htmx OOB, hash-anchor / myers diffs) belong — deferred until here.
