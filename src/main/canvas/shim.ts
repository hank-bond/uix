// canvas writeback shim.
//
// Injected into served canvas HTML so a human can edit the pane and have edits
// flow back to the store. The canvas frame is sandboxed off `window.uix` (see
// preload), so the only channel out is postMessage to the cockpit parent, which
// forwards over IPC. The shim is added at serve time and never persisted: it
// removes its own <script> node before serializing, so it never leaks into
// stored content.

import { assertCanvasKey } from "../../shared/canvas";

// Embedded raw into the script via a template; the key is validated so it
// cannot contain quotes or break out of the string literal.
function shimScript(key: string): string {
  return `(function () {
  var self = document.currentScript;
  if (self) self.remove();
  var KEY = "${key}";
  var timer;
  // outerHTML serializes attributes, not live form state — reflect each
  // control's current property onto the clone so a selection/typed value is
  // captured, not just the markup it was parsed from.
  function reflectFormState(live, copy) {
    var from = live.querySelectorAll("input, textarea, select option");
    var to = copy.querySelectorAll("input, textarea, select option");
    for (var i = 0; i < from.length; i++) {
      var l = from[i];
      var c = to[i];
      if (l.tagName === "OPTION") {
        if (l.selected) c.setAttribute("selected", "");
        else c.removeAttribute("selected");
      } else if (l.tagName === "TEXTAREA") {
        c.textContent = l.value;
      } else {
        var type = (l.getAttribute("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") {
          if (l.checked) c.setAttribute("checked", "");
          else c.removeAttribute("checked");
        } else {
          c.setAttribute("value", l.value);
        }
      }
    }
  }
  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    reflectFormState(document.documentElement, clone);
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
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
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
