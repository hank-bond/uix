// Drives the server browser conformance flow through PandaScript and Lightpanda.

const origin = "__UIX_BROWSER_ORIGIN__";
const workspacePath = "/workspaces/reference";
const page = new globalThis.Page();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPageValue(expression) {
  return page.evaluate(expression);
}

function setCurrentSessionTitle(title) {
  if (
    readPageValue(
      `document.querySelector(".session-pill__button")?.getAttribute("aria-expanded")`,
    ) !== "true"
  ) {
    page.click(".session-pill__button");
  }
  page.waitForScript(`document.querySelector(".session-picker__edit-title")`, {
    timeout: 5000,
  });
  page.click(".session-picker__edit-title");
  page.waitForScript(`document.querySelector(".session-picker__title-input")`, {
    timeout: 5000,
  });
  page.fill(".session-picker__title-input", title);
  page.click(".session-picker__save-title");
  page.waitForScript(
    `document.querySelector(".session-pill__label")?.textContent === ${JSON.stringify(title)}`,
    { timeout: 10000 },
  );
}

await page.goto(`${origin}${workspacePath}`, {
  waitUntil: "load",
  timeout: 20000,
});
page.waitForScript(
  `location.pathname.startsWith("${workspacePath}/sessions/") &&
   document.querySelectorAll("[data-uix-surface]").length === 1`,
  { timeout: 15000 },
);
console.log("UIX_BROWSER_STAGE:shell");
page.waitForScript(
  `document.querySelector('[data-browser-chat-state="hydrated"]')`,
  { timeout: 10000 },
);
console.log("UIX_BROWSER_STAGE:chat-hydrated");

const initial = JSON.parse(
  readPageValue(`JSON.stringify({
    pathname: location.pathname,
    surfaces: Array.from(document.querySelectorAll("[data-uix-surface]"))
      .map((surface) => surface.getAttribute("data-uix-surface")),
    statusHidden: document.querySelector("#status")?.hidden,
  })`),
);
assert(
  initial.pathname.startsWith(`${workspacePath}/sessions/`),
  "workspace-only location was not canonicalized",
);
assert(
  JSON.stringify(initial.surfaces) === JSON.stringify(["chat"]),
  "Chat surface did not mount",
);
assert(
  initial.statusHidden === true,
  "accepted workspace status stayed visible",
);
console.log("UIX_BROWSER_STAGE:initial");

page.fill(".composer__input", "PandaScript draft");
page.click(".composer__send");
page.waitForScript(
  `document.querySelector("#browser-chat-submission")?.textContent === "PandaScript draft"`,
  { timeout: 10000 },
);
console.log("UIX_BROWSER_STAGE:chat");

const firstSessionPath = initial.pathname;
setCurrentSessionTitle("First session");

const isMac = readPageValue("navigator.platform")
  .toLowerCase()
  .startsWith("mac");
readPageValue(`window.dispatchEvent(new KeyboardEvent("keydown", {
  key: "n",
  ${isMac ? "metaKey" : "ctrlKey"}: true,
  bubbles: true,
}))`);
page.waitForScript(
  `location.pathname !== ${JSON.stringify(firstSessionPath)} &&
   location.pathname.startsWith("${workspacePath}/sessions/") &&
   document.querySelector('[data-browser-chat-state="hydrated"]')`,
  { timeout: 15000 },
);
const secondSessionPath = readPageValue("location.pathname");
setCurrentSessionTitle("Second session");
page.waitForScript(
  `Array.from(document.querySelectorAll(".session-picker__option"))
    .some((option) => option.textContent?.includes("First session"))`,
  { timeout: 5000 },
);
readPageValue(`(() => {
  const option = Array.from(document.querySelectorAll(".session-picker__option"))
    .find((candidate) => candidate.textContent?.includes("First session"));
  if (!(option instanceof HTMLElement)) throw new Error("First session option not found");
  option.click();
  return true;
})()`);
page.waitForScript(
  `location.pathname === ${JSON.stringify(firstSessionPath)} &&
   document.querySelector(".session-pill__label")?.textContent === "First session"`,
  { timeout: 10000 },
);
console.log("UIX_BROWSER_STAGE:sessions");

readPageValue("history.back(); true");
page.waitForScript(
  `location.pathname === ${JSON.stringify(secondSessionPath)} &&
   document.querySelector(".session-pill__label")?.textContent === "Second session"`,
  { timeout: 5000 },
);
readPageValue("history.forward(); true");
page.waitForScript(
  `location.pathname === ${JSON.stringify(firstSessionPath)} &&
   document.querySelector(".session-pill__label")?.textContent === "First session"`,
  { timeout: 15000 },
);
console.log("UIX_BROWSER_STAGE:history");

const missingSessionPath = `${workspacePath}/sessions/missing-session`;
// Lightpanda reloads the document when traversing an invalid pushState entry.
// Dispatching popstate directly still exercises the production in-page rollback.
readPageValue(`(() => {
  history.pushState(null, "", ${JSON.stringify(missingSessionPath)});
  if (location.pathname !== ${JSON.stringify(missingSessionPath)}) {
    throw new Error("Failed to install the rejected history target");
  }
  dispatchEvent(new Event("popstate"));
  return true;
})()`);
page.waitForScript(
  `location.pathname === ${JSON.stringify(firstSessionPath)} &&
   document.querySelector(".session-pill__label")?.textContent === "First session"`,
  { timeout: 5000 },
);
console.log("UIX_BROWSER_STAGE:failed-history");

const canvasPage = new globalThis.Page();
await canvasPage.goto(`${origin}/workspaces/canvas`, {
  waitUntil: "load",
  timeout: 15000,
});
canvasPage.waitForScript(
  `location.pathname.startsWith("/workspaces/canvas/sessions/") &&
   document.querySelector(".canvas-iframe")?.contentDocument?.readyState === "complete"`,
  { timeout: 15000 },
);
const canvasBootstrap = JSON.parse(
  canvasPage.evaluate(`JSON.stringify({
    location: document.querySelector(".canvas-iframe")?.contentWindow?.location?.href,
    html: document.querySelector(".canvas-iframe")?.contentDocument?.documentElement?.outerHTML,
  })`),
);
assert(
  canvasBootstrap.location.includes("/resources/canvas.canvas/iframe/main"),
  "Canvas did not load its iframe content resource",
);
assert(
  canvasBootstrap.html.includes("canvas:ready"),
  "Canvas iframe bootstrap was not served",
);
canvasPage.close();
console.log("UIX_BROWSER_STAGE:canvas");

const activeSessionId = firstSessionPath.slice(
  `${workspacePath}/sessions/`.length,
);
console.log(`UIX_BROWSER_RESTART:${activeSessionId}`);
page.waitForScript(
  `(() => {
    const status = document.querySelector("#status");
    if (status?.hidden === false) globalThis.__browserSawDisconnect = true;
    return globalThis.__browserSawDisconnect === true &&
      status?.hidden === true &&
      document.querySelector(".session-pill__label")?.textContent === "After reconnect";
  })()`,
  { timeout: 20000 },
);

return "UIX_BROWSER_FLOW_PASSED";
