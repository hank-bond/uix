import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { chromium, type Page } from "playwright";
import { expect, it } from "vitest";

import { encodeFeatureWebRoot } from "./viewpoint-urls";
import {
  parseWebSocketServerMessage,
  type WebSocketReadyMessage,
  type WebSocketRequestMessage,
  type WebSocketServerMessage,
} from "./websocket-messages";

const repositoryRoot = resolve(__dirname, "../../..");
const execFileAsync = promisify(execFile);

it("loads viewpoint Canvas pages in the server browser and drains accepted HTTP work across retarget and close", async () => {
  await using lifetime = new AsyncDisposableStack();
  const root = await mkdtemp(join(tmpdir(), "uix-server-viewpoint-"));
  lifetime.defer(() => rm(root, { recursive: true, force: true }));
  await createFixture(root);
  const outputRoot = join(root, "server-build");
  const buildUrl = pathToFileURL(
    join(repositoryRoot, "hosts/server/build.config.mjs"),
  ).href;
  await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import(${JSON.stringify(buildUrl)}).then(({ buildServer }) => buildServer(${JSON.stringify(outputRoot)}))`,
    ],
    { cwd: repositoryRoot },
  );
  const port = await reserveLoopbackPort();
  const origin = `http://127.0.0.1:${String(port)}`;
  const server = lifetime.use(startServer(root, outputRoot, port));
  await server.ready;
  const browser = await chromium.launch();
  lifetime.defer(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const peer = await context.newPage();
  const errors: string[] = [];
  const errorListener = (error: Error): void => {
    errors.push(error.message);
  };
  for (const observed of [page, peer]) {
    observed.on("pageerror", errorListener);
    lifetime.defer(() => {
      observed.off("pageerror", errorListener);
    });
  }
  let connections = 0;
  const connectionListener = (): void => {
    connections += 1;
  };
  page.on("websocket", connectionListener);
  lifetime.defer(() => {
    page.off("websocket", connectionListener);
  });
  try {
    await page.goto(`${origin}/workspaces/reference`);
    const initialUrl = await readRouteUrl(page);
    await page.getByLabel("Retained surface state").fill("keep me");
    await page
      .getByText("Underscored feature mounted", { exact: true })
      .waitFor();
    await page.locator('iframe[title="canvas main"]').waitFor();
    await page.locator("textarea").waitFor();
    await peer.goto(`${origin}/workspaces/reference`);
    const peerUrl = await readRouteUrl(peer);
    expect(peerUrl).not.toBe(initialUrl);
    expect(new URL(initialUrl).pathname).toMatch(
      /^\/workspaces\/reference\/viewpoints\/[^/]+\/canvas\/view$/,
    );
    expect(new URL(initialUrl).search).toBe("?key=reports%2Fmain");

    const firstControl = lifetime.use(await openConnection(page.url()));
    const peerControl = lifetime.use(await openConnection(peer.url()));
    lifetime.defer(async () => {
      await peerControl.request("canvas.release");
    });
    const controlRoot = encodeFeatureWebRoot({
      publicOrigin: origin,
      workspaceId: "reference",
      featureId: "canvas",
      binding: firstControl.ready.webBinding,
    });
    expect(controlRoot).not.toBe(new URL(".", initialUrl).href);
    await writeCanvas(firstControl, "First Agent");
    const servedHtml = await (await fetch(initialUrl)).text();
    await writeCanvas(peerControl, "Peer Agent");
    await firstControl[Symbol.asyncDispose]();
    expect((await fetch(initialUrl)).status).toBe(200);
    expect(
      (await fetch(new URL("view?key=reports%2Fmain", controlRoot))).status,
    ).toBe(404);
    await assertCanvasDocument(page, "First Agent");
    await assertCanvasDocument(peer, "Peer Agent");
    for (const [observed, label] of [
      [page, "First Agent"],
      [peer, "Peer Agent"],
    ] as const) {
      await expect
        .poll(() =>
          observed
            .frameLocator('iframe[title="canvas main"]')
            .locator("h1")
            .textContent(),
        )
        .toBe(label);
    }

    const response = await fetch(initialUrl, { headers: { Origin: origin } });
    expect(await response.text()).toBe(servedHtml);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(
      (
        await fetch(initialUrl, {
          headers: { Origin: "https://other.example" },
        })
      ).status,
    ).toBe(403);
    for (const path of ["view/", "nested/view", "%2Fview", "%76iew/"]) {
      expect(
        (
          await fetch(
            new URL(`${path}?key=reports%2Fmain`, new URL(".", initialUrl)),
          )
        ).status,
      ).toBe(404);
    }
    expect(
      (await fetch(new URL("view", new URL(".", initialUrl)))).status,
    ).toBe(400);
    expect((await fetch(`${initialUrl}&key=other`)).status).toBe(400);
    expect((await fetch(initialUrl, { method: "POST" })).status).toBe(405);

    await assertNativeAddressing(page, initialUrl);
    const frame = page.frameLocator('iframe[title="canvas reports/main"]');
    await frame.getByLabel("Choice").fill("human edit");
    await expect
      .poll(async () => (await fetch(initialUrl)).text())
      .toContain('value="human edit"');
    expect(await frame.locator("script").count()).toBe(1);
    await frame.getByRole("button", { name: "Ask Agent" }).evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
    expect(await page.locator("[data-prompt]").textContent()).toBe("");
    await frame.getByRole("button", { name: "Ask Agent" }).click();
    await expect
      .poll(() => page.locator("[data-prompt]").textContent())
      .toBe("Review choices");
    expect(await page.locator("[data-prompt-count]").textContent()).toBe("1");

    await peerControl.request("canvas.hold");
    const retained = fetch(
      initialUrl.replace("reports%2Fmain", "reports%2Fslow"),
    );
    await expect.poll(() => peerControl.request("canvas.started")).toBe(1);
    await page
      .getByRole("button", { name: "New probe session", exact: true })
      .click();
    await expect.poll(() => readRouteUrl(page)).not.toBe(initialUrl);
    const nextUrl = await readRouteUrl(page);
    expect(connections).toBe(1);
    expect(await page.getByLabel("Retained surface state").inputValue()).toBe(
      "keep me",
    );
    expect((await fetch(initialUrl)).status).toBe(404);
    expect(await readRouteUrl(peer)).toBe(peerUrl);
    expect(await (await fetch(peerUrl)).text()).toContain("Peer Agent");
    await peerControl.request("canvas.release");
    const retainedResponse = await retained;
    expect(retainedResponse.status).toBe(200);
    expect(await retainedResponse.text()).toContain("First Agent");

    await expect.poll(() => page.url()).not.toBe(firstControl.location);
    const nextControl = lifetime.use(await openConnection(page.url()));
    await writeCanvas(nextControl, "Next Agent");
    await nextControl[Symbol.asyncDispose]();
    await assertCanvasDocument(page, "Next Agent");
    await mkdir(join(repositoryRoot, "out/test-results"), { recursive: true });
    await page.screenshot({
      path: join(repositoryRoot, "out/test-results/server-viewpoint.png"),
    });

    await peerControl.request("canvas.hold");
    const closingRead = fetch(
      nextUrl.replace("reports%2Fmain", "reports%2Fslow"),
    );
    await expect.poll(() => peerControl.request("canvas.started")).toBe(1);
    await page.close();
    await expect.poll(async () => (await fetch(nextUrl)).status).toBe(404);
    await peerControl.request("canvas.release");
    expect(await (await closingRead).text()).toContain("Next Agent");
    expect(await (await fetch(peerUrl)).text()).toContain("Peer Agent");
    expect(errors).toEqual([]);
  } catch (error) {
    if (!page.isClosed()) {
      try {
        await mkdir(join(repositoryRoot, "out/test-results"), {
          recursive: true,
        });
        await page.screenshot({
          path: join(
            repositoryRoot,
            "out/test-results/server-viewpoint-failure.png",
          ),
        });
      } catch {
        // Diagnostic capture must not replace the original failure.
      }
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nBrowser errors: ${errors.join("\n")}\nServer output: ${server.output}`,
      { cause: error },
    );
  }
}, 120_000);

// Browser assertions

async function readRouteUrl(page: Page): Promise<string> {
  const route = page.locator("[data-route]");
  await route.waitFor();
  const url = await route.textContent();
  if (!url) throw new Error("Missing bound route URL");
  return url;
}

async function assertCanvasDocument(page: Page, label: string): Promise<void> {
  await expect
    .poll(() =>
      page
        .frameLocator('iframe[title="canvas reports/main"]')
        .locator("h1")
        .textContent(),
    )
    .toBe(label);
}

async function assertNativeAddressing(page: Page, url: string): Promise<void> {
  const frame = page.frameLocator('iframe[title="canvas reports/main"]');
  const root = new URL(".", url).href;
  expect(
    await frame.locator("h1").evaluate((node) => getComputedStyle(node).color),
  ).toBe("rgb(12, 34, 56)");
  expect(
    await frame
      .locator("h1")
      .evaluate((node) => node.getBoundingClientRect().width),
  ).toBeGreaterThan(100);
  expect(await frame.locator("base").count()).toBe(0);
  expect(await frame.locator("#asset").getAttribute("href")).toBe(
    "assets/site.css",
  );
  expect(
    await frame
      .locator("#asset")
      .evaluate((node) => (node as HTMLAnchorElement).href),
  ).toBe(`${root}assets/site.css`);
  expect(
    await frame
      .locator("#api")
      .evaluate((node) => (node as HTMLAnchorElement).href),
  ).toBe(`${root}api/data`);
  await frame.getByRole("link", { name: "Details", exact: true }).click();
  await expect
    .poll(() => frame.locator("body").evaluate(() => location.href))
    .toBe(`${url}#details`);
  await frame
    .getByRole("link", { name: "Dynamic details", exact: true })
    .click();
  expect(await frame.locator("body").evaluate(() => location.href)).toBe(
    `${url}#dynamic`,
  );
  expect(
    await frame
      .locator("body")
      .evaluate(() => new URL("?key=other", location.href).href),
  ).toBe(`${root}view?key=other`);
}

// Protocol controls

interface ProtocolConnection extends AsyncDisposable {
  readonly location: string;
  readonly ready: WebSocketReadyMessage;
  request(channel: string, payload?: unknown): Promise<unknown>;
}

async function openConnection(location: string): Promise<ProtocolConnection> {
  await using acquisition = new AsyncDisposableStack();
  const socket = new WebSocket(location.replace(/^http/, "ws"));
  acquisition.defer(async () => {
    if (socket.readyState === WebSocket.CLOSED) return;
    const closed = once(socket, "close", {
      signal: AbortSignal.timeout(10_000),
    });
    socket.close(1000, "Fixture complete");
    await closed;
  });
  const ready = await readProtocolMessage(socket);
  if (ready.type !== "ready") throw new Error("Expected ready");
  const lifetime = acquisition.move();
  let nextRequestId = 0;
  return {
    location,
    ready,
    async request(channel, payload) {
      const message = await readProtocolMessage(socket, {
        type: "request",
        id: String(++nextRequestId),
        channel,
        payload,
      });
      if (message.type === "error") throw new Error(message.message);
      if (message.type !== "response") throw new Error("Expected response");
      return message.value;
    },
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

async function readProtocolMessage(
  socket: WebSocket,
  request?: WebSocketRequestMessage,
): Promise<WebSocketServerMessage> {
  using lifetime = new DisposableStack();
  const listeners = new AbortController();
  lifetime.defer(() => {
    listeners.abort();
  });
  return await new Promise((resolveMessage, reject) => {
    lifetime.use(
      setTimeout(() => {
        reject(new Error("Protocol response timed out"));
      }, 10_000),
    );
    const failureListener = (): void => {
      reject(new Error("Protocol connection closed or failed"));
    };
    socket.addEventListener("error", failureListener, {
      signal: listeners.signal,
    });
    socket.addEventListener("close", failureListener, {
      signal: listeners.signal,
    });
    socket.addEventListener(
      "message",
      (event) => {
        try {
          const message = parseWebSocketServerMessage(
            JSON.parse(String(event.data)),
          );
          if (
            request &&
            ((message.type !== "response" && message.type !== "error") ||
              message.id !== request.id)
          )
            return;
          resolveMessage(message);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
      { signal: listeners.signal },
    );
    if (request) {
      if (socket.readyState !== WebSocket.OPEN)
        throw new Error("Protocol connection is not open");
      socket.send(JSON.stringify(request));
    }
  });
}

async function writeCanvas(
  connection: ProtocolConnection,
  label: string,
): Promise<void> {
  const html = `<html><head><style>h1 { color: rgb(12, 34, 56); } #details { margin-top: 900px; }</style></head><body><h1>${label}</h1><label>Choice<input></label><button data-canvas-prompt="Review choices">Ask Agent</button><a href="#details">Details</a><a id="asset" href="assets/site.css">Asset</a><a id="api" href="api/data">API</a><div id="details">Target</div><div id="dynamic">Dynamic target</div><script>document.body.insertAdjacentHTML('beforeend', '<a href="#dynamic">Dynamic details</a>');</script></body></html>`;
  for (const key of ["main", "reports/main", "reports/slow"]) {
    await connection.request("canvas.fixture_write", { key, html });
  }
}

// Workspace fixture

async function createFixture(root: string): Promise<void> {
  const canvasRoot = join(repositoryRoot, "src/features/canvas");
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(root, "node_modules"),
  );
  await writeFile(
    join(root, "server.workspaces.json"),
    JSON.stringify({
      version: 1,
      workspaces: [{ id: "reference", manifest: "./uix.workspace.json" }],
    }),
  );
  await writeFile(
    join(root, "uix.workspace.json"),
    JSON.stringify({
      name: "Server viewpoint fixture",
      features: [
        { entry: "./canvas.ts", settings: {} },
        { entry: "./underscored.ts", settings: {} },
        {
          entry: join(repositoryRoot, "src/features/chat/index.ts"),
          settings: {},
        },
      ],
      settings: {},
    }),
  );
  await writeFile(
    join(root, "underscored.ts"),
    `import { defineFeature } from "@uix/api/feature";
export const feature = defineFeature({ id: "my_feature", workspace: () => ({ surfaces: ["./underscored-surface.tsx"] }) });`,
  );
  await writeFile(
    join(root, "underscored-surface.tsx"),
    `import { defineSurface } from "@uix/api/workspace";
export const surface = defineSurface({ name: "underscore-probe", render: () => <p>Underscored feature mounted</p> });`,
  );
  // The fixture gates the production handler, leaving the runtime's admission and guards intact.
  await writeFile(
    join(root, "canvas.ts"),
    `
import { Type } from "typebox";
import { withHandlers } from "@uix/api/channels";
import { feature as canvas } from ${JSON.stringify(join(canvasRoot, "index.ts"))};
import { CanvasKeySchema } from ${JSON.stringify(join(canvasRoot, "shared/addressing.ts"))};
const writeChannels = { requests: { fixture_write: { requestSchema: Type.Object({ key: CanvasKeySchema, html: Type.String() }), responseSchema: Type.Void() } }, events: {} };
const controls = { requests: {
  hold: { requestSchema: Type.Void(), responseSchema: Type.Void() },
  release: { requestSchema: Type.Void(), responseSchema: Type.Void() },
  started: { requestSchema: Type.Void(), responseSchema: Type.Number() },
}, events: {} };
let release = () => {};
let gate = Promise.resolve();
let started = 0;
export const feature = {
  ...canvas,
  workspace(ctx) {
    const contributions = canvas.workspace(ctx);
    return { ...contributions,
      agentChannelContracts: [...contributions.agentChannelContracts, writeChannels],
      surfaces: [${JSON.stringify(join(canvasRoot, "workspace/surface.tsx"))}, "./probe.tsx"],
      channels: [withHandlers(controls, {
        hold: { handler: () => { started = 0; gate = new Promise(resolve => { release = resolve; }); } },
        release: { handler: () => { release(); } }, started: { handler: () => started },
      })],
    };
  },
  agent(ctx) {
    const contributions = canvas.agent(ctx);
    const writeTool = contributions.agentTools.find(tool => tool.name === "anchor_write").tool;
    return { ...contributions,
      channels: [...contributions.channels, withHandlers(writeChannels, { fixture_write: { async handler(input) { await writeTool.execute("fixture", { ...input, reason: "Browser coverage" }); } } })],
      webRoutes: contributions.webRoutes.map(route => ({
      ...route, async handler(input, respond) {
        if (input.query.key === "reports/slow") { started += 1; await gate; }
        return route.handler(input, respond);
      },
    })) };
  },
};`,
  );
  await writeFile(
    join(root, "probe.tsx"),
    `
import { useState } from "react";
import { defineSurface, useWebRouteClient, useInvokeAction } from "@uix/api/workspace";
import { agentChannels } from "@uix/api/agent-channels";
import { canvasChannels } from ${JSON.stringify(join(canvasRoot, "shared/channels.ts"))};
import { Canvas } from ${JSON.stringify(join(canvasRoot, "workspace/Canvas.tsx"))};
import { parseCanvasKey } from ${JSON.stringify(join(canvasRoot, "shared/addressing.ts"))};
import { CanvasDocumentRoute } from ${JSON.stringify(join(canvasRoot, "shared/web-routes.ts"))};
function Probe({ canvas, agent }) {
  const client = useWebRouteClient(CanvasDocumentRoute);
  const actionRunner = useInvokeAction();
  const canvasKey = parseCanvasKey("reports/main");
  const url = client.toUrl({ query: { key: canvasKey } });
  const [prompt, setPrompt] = useState("");
  const [promptCount, setPromptCount] = useState(0);
  return <section style={{ width: "100%", minWidth: 240 }}>
    <label>Retained surface state<input /></label>
    <output data-route style={{ display: "block", overflowWrap: "anywhere" }}>{url}</output>
    <output data-prompt>{prompt}</output><output data-prompt-count>{promptCount}</output>
    <button onClick={() => actionRunner("uix.session.new")}>New probe session</button>
    <Canvas canvasKey={canvasKey} client={canvas} agent={{ ...agent, requests: { ...agent.requests, prompt: async ({ text }) => { setPrompt(text); setPromptCount(count => count + 1); } } }} />
  </section>;
}
export const surface = defineSurface({ name: "route-probe", channels: { canvas: canvasChannels, agent: agentChannels }, render: clients => <Probe {...clients} /> });`,
  );
}

// Server process lifetime

function startServer(
  root: string,
  outputRoot: string,
  port: number,
): AsyncDisposable & {
  readonly ready: Promise<void>;
  readonly output: string;
} {
  const child = spawn(process.execPath, [join(outputRoot, "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      UIX_LOG_LEVEL: "info",
      UIX_SERVER_PROFILE: "loopback",
      UIX_PUBLIC_ORIGIN: `http://127.0.0.1:${String(port)}`,
      UIX_SERVER_HOST: "127.0.0.1",
      UIX_SERVER_PORT: String(port),
      UIX_SERVER_DATA_DIR: join(root, "profile"),
      UIX_SERVER_REGISTRY: join(root, "server.workspaces.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lifetime = new AsyncDisposableStack();
  const listeners = lifetime.use(new DisposableStack());
  let output = "";
  let hasExited = false;
  const exited = new Promise<void>((resolveExit) => {
    const closeListener = (): void => {
      hasExited = true;
      resolveExit();
    };
    child.once("close", closeListener);
    listeners.defer(() => {
      child.off("close", closeListener);
    });
  });
  const ready = new Promise<void>((resolveReady, reject) => {
    const timeout = listeners.use(
      setTimeout(() => {
        reject(new Error(`Server startup timed out: ${output}`));
      }, 20_000),
    );
    const errorListener = (error: Error): void => {
      timeout[Symbol.dispose]();
      reject(error);
    };
    child.once("error", errorListener);
    listeners.defer(() => {
      child.off("error", errorListener);
    });
    const exitListener = (): void => {
      timeout[Symbol.dispose]();
      reject(new Error(`Server exited: ${output}`));
    };
    child.once("exit", exitListener);
    listeners.defer(() => {
      child.off("exit", exitListener);
    });
    const outputListener = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes('"msg":"server_started"')) {
        timeout[Symbol.dispose]();
        resolveReady();
      }
    };
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", outputListener);
      listeners.defer(() => {
        stream.off("data", outputListener);
      });
    }
  });
  lifetime.defer(async () => {
    if (hasExited) return;
    child.kill("SIGTERM");
    using _timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 15_000);
    await exited;
  });
  return {
    ready,
    get output() {
      return output;
    },
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

async function reserveLoopbackPort(): Promise<number> {
  await using server = createServer();
  const listening = once(server, "listening", {
    signal: AbortSignal.timeout(10_000),
  });
  server.listen(0, "127.0.0.1");
  await listening;
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing listener address");
  return address.port;
}
