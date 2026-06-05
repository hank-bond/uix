// UIX cockpit — canvas writeback shim.
//
// Injected into served canvas HTML so a human can edit the pane and have edits
// flow back to the store. The canvas frame is sandboxed off `window.uix` (see
// preload), so the only channel out is postMessage to the cockpit parent, which
// forwards over IPC. The shim is added at serve time and never persisted: it
// removes its own <script> node before serializing, and strips the
// contenteditable attribute it sets, so neither leaks into stored content.

import { assertCanvasKey } from "../../shared/canvas";

// Embedded raw into the script via a template; the key is validated so it
// cannot contain quotes or break out of the string literal.
function shimScript(key: string): string {
  return `(function () {
  var self = document.currentScript;
  if (self) self.remove();
  var KEY = "${key}";
  var timer;
  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    var body = clone.querySelector("body");
    if (body) body.removeAttribute("contenteditable");
    return clone.outerHTML;
  }
  function flush() {
    parent.postMessage(
      { type: "uix:canvas-writeback", key: KEY, html: serialize() },
      "*"
    );
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  function init() {
    document.body.contentEditable = "true";
    document.body.addEventListener("input", schedule);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();`;
}

export function injectCanvasShim(html: string, key: string): string {
  assertCanvasKey(key);
  return `${html}\n<script>${shimScript(key)}</script>`;
}
