// Adds Canvas's self-removing browser shim to a served copy of canonical authored HTML.

import { parse } from "parse5";

import type { CanvasKey } from "../shared/addressing";

// The validated Canvas key grammar excludes quotes and markup, so embedding
// the key cannot terminate the JavaScript string or script element.
function toWritebackScript(key: CanvasKey): string {
  return `(function () {
  var self = document.currentScript;
  if (self) self.remove();
  var KEY = "${key}";
  var pageLifetime = new DisposableStack();
  var listeners = new AbortController();
  pageLifetime.defer(function () { listeners.abort(); });
  var pendingTimers = new Set();
  pageLifetime.defer(function () {
    pendingTimers.forEach(function (timer) { clearTimeout(timer); });
    pendingTimers.clear();
  });
  var writebackTimer;
  var lastHtml = "";
  function scheduleTask(taskRunner, delay) {
    if (pageLifetime.disposed) return;
    var timer = setTimeout(function () {
      pendingTimers.delete(timer);
      taskRunner();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  }
  function cancelWriteback() {
    clearTimeout(writebackTimer);
    pendingTimers.delete(writebackTimer);
  }
  function pageHideHandler(event) {
    // A cached document retains its listeners and resumes its timers on return.
    if (!event.persisted) pageLifetime.dispose();
  }
  window.addEventListener("pagehide", pageHideHandler, { signal: listeners.signal });
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
    cancelWriteback();
    writebackTimer = scheduleTask(flush, 400);
  }
  // A canvas can declare a user-operated agent action with
  // data-canvas-prompt="...". Capture the trusted click now, then serialize on
  // the next task so the document includes synchronous click-handler changes.
  // Scripted click()/dispatchEvent() events have isTrusted=false and cannot
  // start an agent run.
  function clickHandler(event) {
    schedule();
    var target = event.target;
    if (!event.isTrusted || !target || !target.closest) return;
    var trigger = target.closest("[data-canvas-prompt]");
    if (!trigger) return;
    var prompt = (trigger.getAttribute("data-canvas-prompt") || "").trim();
    if (!prompt) return;
    event.preventDefault();
    scheduleTask(function () {
      cancelWriteback();
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
  function installWriteback() {
    window.__canvasWriteback = schedule;
    pageLifetime.defer(function () {
      if (window.__canvasWriteback === schedule) delete window.__canvasWriteback;
    });
    var options = { capture: true, signal: listeners.signal };
    document.addEventListener("input", schedule, options);
    document.addEventListener("change", schedule, options);
    document.addEventListener("click", clickHandler, options);
    document.addEventListener("drop", schedule, options);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWriteback, {
      once: true, signal: listeners.signal
    });
  } else {
    installWriteback();
  }
})();`;
}

/** Add derived markup without reserializing or changing any authored bytes. */
export function toCanvasDocumentHtml(html: string, key: CanvasKey): string {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const root = document.childNodes.find((node) => node.nodeName === "html");
  const head =
    root && "childNodes" in root
      ? root.childNodes.find((node) => node.nodeName === "head")
      : undefined;
  const offset =
    head && "tagName" in head
      ? head.sourceCodeLocation?.startTag?.endOffset
      : undefined;
  if (offset === undefined) {
    throw new Error("Canvas document HTML must have a canonical head element.");
  }
  // Run before authored scripts and remove the shim immediately, so later
  // DOM serialization cannot copy derived code into the managed document.
  return `${html.slice(0, offset)}<script>${toWritebackScript(key)}</script>${html.slice(offset)}`;
}
