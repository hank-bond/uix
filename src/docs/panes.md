---
summary: "The renderer ships a hardcoded conversation pane and a hardcoded canvas iframe pane; the canvas is key-addressed, served over own-origin uix-canvas:// URLs, sandboxed, refreshed by whole-document iframe reload, and served with a writeback shim for form/contenteditable edits."
status: active
---

# Panes

UIX currently has two hardcoded renderer panes in `src/renderer/App.tsx`:

- a conversation pane (`src/renderer/Conversation.tsx`);
- a canvas iframe pane (`src/renderer/Canvas.tsx`) hardcoded to `canvasKey="main"`.

There is no public pane host, slot registry, or `registerPane` extension API in the current code.

## Canvas iframe pane

The canvas pane renders agent-authored HTML from a canvas key such as `main`. Keys are not filesystem paths. The current local store maps keys to `.uix/canvas/<key>.html`, but the renderer and agent tools address canvases only by key.

Canvas HTML is loaded with `iframe src`, never `srcdoc`. `srcdoc` would inherit the cockpit renderer origin, which would let agent-authored HTML reach privileged cockpit APIs. UIX instead serves canvas content from the custom `uix-canvas://` protocol registered in `src/main/canvas/protocol.ts`.

Each canvas key maps to a stable own-origin URL by reversing slash-separated key segments into host labels:

```text
main                    -> uix-canvas://main/
reports/security-review -> uix-canvas://security-review.reports/
```

The iframe uses `sandbox="allow-scripts allow-same-origin"` with `src="uix-canvas://main/"`. The pairing is safe here because `allow-same-origin` means same-origin with the canvas's own custom-protocol origin, not with the cockpit. The canvas origin has no cockpit DOM privileges, and UIX exposes the preload `window.uix` bridge only to the main frame, not to canvas iframes.

Canvas refresh is a whole-document iframe reload. When `uix_canvas_write` or `uix_canvas_edit` updates a key, main broadcasts `canvasChanged { key }`; matching panes bump a monotonic query token on the iframe URL and refetch the document.

Canvas HTML is served with a small injected writeback shim (`src/main/canvas/shim.ts`). The shim is never written to disk: it removes its own `<script>` node before serialization, listens for `input` / `change`, reflects live form-control state (`input`, `textarea`, `select option`) into a cloned document, and posts the serialized HTML to the parent frame. The parent accepts messages only from the canvas's own origin/key and forwards them to main via `writebackCanvas({ key, html })`, which commits through the same content store used by the canvas agent tools.

The shim does not make the whole document editable. Normal text remains selectable browser content, form controls keep their native edit behavior, and only author-provided `contenteditable` regions are browser-editable. The current canvas pane does not patch DOM in place, expose `window.uix` to the iframe, trigger agent turns from iframe events, or watch canvas files.
