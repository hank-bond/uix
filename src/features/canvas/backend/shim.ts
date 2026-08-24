// Boots a feature-origin Canvas frame and injects postMessage writeback into viewpoint HTML.
//
// The static frame receives selected-viewpoint HTML from its parent after the
// parent reads it through the Agent channel. The frame cannot access
// `window.channels`, so it sends edits and prompt actions back through
// postMessage. The writeback script removes itself before serialization.

import type { CanvasKey } from "../shared/addressing";

// Embedded raw into the script via a template. The host validates the key so it
// cannot contain quotes or break out of the string literal.
function shimScript(key: CanvasKey): string {
  return `(function () {
  var self = document.currentScript;
  if (self) self.remove();
  var KEY = "${key}";
  var timer;
  var lastHtml = "";
  // outerHTML serializes attributes, not live form state. Reflect each
  // control's current property onto the clone so the clone holds the live
  // selection/typed value, not just the initial markup.
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
      { type: "canvas:writeback", key: KEY, html: html },
      "*"
    );
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
  // A canvas can declare a user-operated agent action with
  // data-canvas-prompt="...". Capture the trusted click now, then serialize on
  // the next task so the document includes synchronous click-handler changes.
  // Scripted click()/dispatchEvent() events have isTrusted=false and cannot
  // start an agent run.
  function onClick(event) {
    schedule();
    var target = event.target;
    if (!event.isTrusted || !target || !target.closest) return;
    var trigger = target.closest("[data-canvas-prompt]");
    if (!trigger) return;
    var prompt = (trigger.getAttribute("data-canvas-prompt") || "").trim();
    if (!prompt) return;
    event.preventDefault();
    setTimeout(function () {
      clearTimeout(timer);
      var html = serialize();
      lastHtml = html;
      parent.postMessage(
        {
          type: "canvas:prompt",
          key: KEY,
          html: html,
          prompt: prompt
        },
        "*"
      );
    }, 0);
  }
  function init() {
    window.__canvasWriteback = schedule;
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

export function createCanvasFrameBootstrap(key: CanvasKey): string {
  const serializedKey = JSON.stringify(key);
  const serializedShim = JSON.stringify(shimScript(key));
  return `<!doctype html>
<meta charset="utf-8">
<script>
(function () {
  var KEY = ${serializedKey};
  var SHIM = ${serializedShim};
  function load(event) {
    var data = event.data;
    if (event.source !== parent || !data || data.type !== "canvas:load") return;
    if (data.key !== KEY || typeof data.html !== "string") return;
    window.removeEventListener("message", load);
    document.open();
    document.write(data.html);
    document.write("<script>" + SHIM + "<\\/script>");
    document.close();
  }
  window.addEventListener("message", load);
  parent.postMessage({ type: "canvas:ready", key: KEY }, "*");
})();
</script>`;
}
