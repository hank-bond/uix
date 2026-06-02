---
summary: "The shipped stage-1 canvas pane: key-addressed store, own-origin uix-canvas:// protocol (not srcdoc), dedicated agent read/write tools, whole-document refresh. Read when working on the canvas pane or its agent tools."
status: accepted
---

# Stage-1 canvas pane

The first canvas stage: get agent-authored HTML on screen, with the file as the eventual source of truth. Constrained by [hosting-compatible-by-default](./2026-05-31-hosting-compatible-by-default.md).

- **Addressed by key, not path.** Slash-namespaced keys (`main`, `reports/security-review`). The local `.uix/canvas/<key>.html` mapping lives only in the store adapter; everything above addresses by key.
- **Dedicated agent tools.** `uix_canvas_read` / `uix_canvas_write` bound into the UIX-owned agent session via internal `AgentBinding`s. Canvas writes are **not** inferred from generic filesystem tool events — this is the write seam for later snapshots/hashes/hosted storage.
- **Own-origin protocol, not `srcdoc`.** HTML served from a stable `uix-canvas://` URL with key segments reversed into the host, so each key has its own origin (path stays free for future fragments). Loaded via `src`; `srcdoc` would inherit the cockpit origin and let agent HTML reach `window.uix`/cockpit DOM. `allow-scripts allow-same-origin` is safe precisely because "same-origin" means the canvas's own origin, which holds nothing privileged.
- **Whole-document refresh.** `canvasChanged { key }` invalidation events, broadcast to live `BrowserWindow`s; panes opt in and filter by key. The pane re-points `src` — no DOM patching, no `fs.watch`.
- **Hardcoded pane.** Stays `<Canvas canvasKey="main" />` until the pane host and a public `registerPane` API land.

The bidirectional follow-on (writeback, the anchored edit channel) is explored in the [canvas-data-channel](../design/canvas-data-channel.md) design note.
