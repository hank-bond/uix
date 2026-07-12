// canvas writeback shim.
//
// Injected into served canvas HTML so a human can edit the pane and have edits
// flow back to the store. The canvas frame is sandboxed off `window.uix` (see
// preload), so the only channel out is postMessage to the cockpit parent, which
// forwards over IPC. The shim is added at serve time and never persisted: it
// removes its own <script> node before serializing, so it never leaks into
// stored content.

import type { CanvasKey } from "../shared/addressing";

// Embedded raw into the script via a template; the key is validated so it
// cannot contain quotes or break out of the string literal.
function shimScript(key: CanvasKey): string {
  return `(function () {
  var self = document.currentScript;
  if (self) self.remove();
  var KEY = "${key}";
  var timer;
  var lastHtml = "";
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
    var html = serialize();
    if (html === lastHtml) return;
    lastHtml = html;
    parent.postMessage(
      { type: "uix:canvas-writeback", key: KEY, html: html },
      "*"
    );
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  // A canvas can declare a user-operated agent action with
  // data-uix-prompt="...". Capture the trusted click now, then serialize on
  // the next task so the document includes synchronous click-handler changes.
  // Scripted click()/dispatchEvent() events have isTrusted=false and cannot
  // start an agent run.
  function onClick(event) {
    schedule();
    var target = event.target;
    if (!event.isTrusted || !target || !target.closest) return;
    var trigger = target.closest("[data-uix-prompt]");
    if (!trigger) return;
    var prompt = (trigger.getAttribute("data-uix-prompt") || "").trim();
    if (!prompt) return;
    event.preventDefault();
    setTimeout(function () {
      clearTimeout(timer);
      var html = serialize();
      lastHtml = html;
      parent.postMessage(
        {
          type: "uix:canvas-prompt",
          key: KEY,
          html: html,
          prompt: prompt
        },
        "*"
      );
    }, 0);
  }
  function init() {
    window.__uixWriteback = schedule;
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("drop", schedule, true);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();`;
}

export function injectCanvasShim(html: string, key: CanvasKey): string {
  return `${html}\n<script>${shimScript(key)}</script>`;
}
