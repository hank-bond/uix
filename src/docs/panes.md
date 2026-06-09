---
summary: "The renderer ships a hardcoded chat pane and a hardcoded canvas iframe pane; the chat pane renders TranscriptItems as scoped chat blocks, and the canvas is key-addressed, served over own-origin uix-canvas:// URLs, sandboxed, refreshed by whole-document iframe reload, and served with a writeback shim."
status: active
---

# Panes

UIX currently has two hardcoded renderer panes in `src/renderer/App.tsx`:

- a chat pane (`src/renderer/chat/Chat.tsx`);
- a canvas iframe pane (`src/renderer/Canvas.tsx`) hardcoded to `canvasKey="main"`.

There is no public pane host, slot registry, or `registerPane` extension API in the current code.

## Chat pane

The chat pane is a scoped renderer feature under `src/renderer/chat/`. Its pane root carries `data-uix-pane="chat"`, and `src/renderer/chat/chat.css` scopes chat-specific block and composer styles under that attribute so future panes do not inherit chat styling by accident.

Main sends `TranscriptItem` appends/replacements over IPC; the chat pane renders them as chat blocks. A chat block is the smallest rendered chat-stream unit, not necessarily a pi session entry. The DOM exposes stable styling hooks such as `data-uix-chat-block`, `data-uix-part`, `data-uix-tool-name`, and `data-uix-custom-type`.

Default chat blocks are first-party defaults, not a public renderer API yet. Tool blocks have a generic fallback plus exact first-party renderers for the canvas tools. The canvas tool renderers extract the text payload, strip anchor gutters from the human-facing display, show the first five lines, and expand the rest inline. The agent-facing tool result still carries anchored lines so the agent can edit safely.

The chat code font is a local Iosevka Regular WOFF2 asset under `src/renderer/chat/assets/fonts/`, applied through `--uix-chat-code-font`. This is hardcoded along the future asset/style contribution shape: a later font/style pack should be able to override the token without replacing block behavior.

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
