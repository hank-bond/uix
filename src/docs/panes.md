# Panes

A pane is a render surface plus, in later milestones, a typed event channel.
The current Stage-1 pane is the built-in canvas iframe pane.

See [`channels.md`](./channels.md), [`contributions.md`](./contributions.md).

## Canvas iframe pane

The canvas pane renders agent-authored HTML from a canvas key such as `main`.
Keys are not filesystem paths. The local v0 store maps keys to
`.uix/canvas/<key>.html`, but panes and agent tools address only keys so the
backing store can later move to a DB, object store, or hosted service.

Canvas HTML is loaded with `iframe src`, never `srcdoc`. `srcdoc` inherits the
cockpit renderer origin, which would let agent-authored HTML reach privileged
cockpit APIs. UIX instead serves canvas content from the custom `uix-canvas://`
protocol.

Each canvas key maps to a stable own-origin URL by reversing slash-separated key
segments into host labels:

```text
main                    -> uix-canvas://main/
reports/security-review -> uix-canvas://security-review.reports/
```

That keeps every canvas cross-origin from the cockpit and from other canvases.
The iframe uses:

```html
<iframe
  sandbox="allow-scripts allow-same-origin"
  src="uix-canvas://main/"
></iframe>
```

The sandbox pairing is safe here because `allow-same-origin` means same-origin
with the canvas's own custom-protocol origin, not with the cockpit. The canvas
origin has no cockpit DOM privileges, and UIX exposes the preload `window.uix`
bridge only to the main frame, not to canvas iframes.

Stage 1 refreshes by whole-document swap. When `uix_canvas_write` updates a key,
main broadcasts `canvasChanged { key }`; matching panes bump a monotonic query
token on the iframe URL and refetch the document. No DOM patching, shim,
writeback, `postMessage`, or filesystem watcher is involved yet.

Future pane work will add the slot registry and public `registerPane` API for
extension-owned React, iframe, and declarative panes. The current canvas pane is
hardcoded until that host exists.
