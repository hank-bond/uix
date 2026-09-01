import {
  type ChildProcessWithoutNullStreams,
  execFile,
  spawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(__dirname, "../../../..");
const pandaScriptTemplate = join(__dirname, "server-browser.test.panda.js");
const temporaryDirectories: string[] = [];
const lightpanda = process.env["UIX_LIGHTPANDA"] ?? "lightpanda";

interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

class ChildProcessFixture {
  readonly child: ChildProcessWithoutNullStreams;
  readonly exit: Promise<ProcessExit>;
  stdout = "";
  stderr = "";
  exitResult: ProcessExit | undefined;

  constructor(
    command: string,
    commandArguments: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) {
    this.child = spawn(command, commandArguments, options);
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.stdout += chunk;
    });
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
    this.exit = new Promise<ProcessExit>((resolveExit, reject) => {
      this.child.once("error", reject);
      this.child.once("exit", (code, signal) => {
        const result = { code, signal };
        this.exitResult = result;
        resolveExit(result);
      });
    });
  }

  async waitForStdout(fragment: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.stdout.includes(fragment)) {
      if (this.exitResult) {
        throw new Error(
          `Process exited before writing ${JSON.stringify(fragment)}\n${this.diagnostics()}`,
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for ${JSON.stringify(fragment)}\n${this.diagnostics()}`,
        );
      }
      await delay(20);
    }
  }

  async stop(): Promise<void> {
    if (this.exitResult) return;
    this.child.kill("SIGTERM");
    const didExit = await Promise.race([
      this.exit.then(() => true),
      delay(15_000).then(() => false),
    ]);
    if (didExit) return;
    this.child.kill("SIGKILL");
    await this.exit;
  }

  diagnostics(): string {
    return `stdout:\n${this.stdout}\nstderr:\n${this.stderr}`;
  }
}

interface BrowserFixture {
  readonly root: string;
  readonly registryPath: string;
  readonly dataDir: string;
  readonly pandaScriptPath: string;
  readonly serverEntry: string;
}

beforeAll(async () => {
  await execFileAsync(lightpanda, ["version"]);
}, 120_000);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("server browser behavior", () => {
  it("drives canonical sessions, history, reconnect recovery, Chat, and Canvas in Lightpanda", async () => {
    const port = await reserveLoopbackPort();
    const origin = `http://127.0.0.1:${String(port)}`;
    const fixture = await createBrowserFixture(origin);
    let server: ChildProcessFixture | undefined;
    let browser: ChildProcessFixture | undefined;

    try {
      server = await startServer(fixture, port);
      browser = new ChildProcessFixture(
        lightpanda,
        [
          "run",
          fixture.pandaScriptPath,
          "--http-timeout",
          "20000",
          "--log-level",
          "error",
        ],
        { cwd: fixture.root, env: process.env },
      );
      try {
        await browser.waitForStdout("UIX_BROWSER_RESTART:", 60_000);
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\nserver:\n${server.diagnostics()}`,
          { cause: error },
        );
      }
      const sessionId = readRestartSessionId(browser.stdout);

      await setSessionTitleThroughProtocol(origin, sessionId);
      await server.stop();
      server = await startServer(fixture, port);

      const browserExit = await browser.exit;
      expect(browserExit, browser.diagnostics()).toEqual({
        code: 0,
        signal: null,
      });
      expect(browser.stdout).toContain("UIX_BROWSER_FLOW_PASSED");
    } finally {
      if (browser && !browser.exitResult) {
        browser.child.kill("SIGKILL");
        await browser.exit.catch(() => undefined);
      }
      await server?.stop();
    }
  }, 120_000);
});

async function createBrowserFixture(origin: string): Promise<BrowserFixture> {
  const root = await mkdtemp(join(tmpdir(), "uix-server-browser-"));
  temporaryDirectories.push(root);
  const registryPath = join(root, "server.workspaces.json");
  const manifestPath = join(root, "uix.workspace.json");
  const canvasRoot = join(root, "canvas");
  const canvasManifestPath = join(canvasRoot, "uix.workspace.json");
  const chatEntryPath = join(root, "chat.ts");
  const chatSurfacePath = join(root, "chat-surface.tsx");
  const dataDir = join(root, "server-data");
  const pandaScriptPath = join(root, "server-browser.panda.js");
  const chatComposerPath = join(
    repositoryRoot,
    "src/features/chat/workspace/ChatComposer.tsx",
  );
  const sessionPillPath = join(
    repositoryRoot,
    "src/features/chat/workspace/SessionPill.tsx",
  );
  const canvasEntryPath = join(repositoryRoot, "src/features/canvas/index.ts");

  const pandaScript = (await readFile(pandaScriptTemplate, "utf8")).replaceAll(
    "__UIX_BROWSER_ORIGIN__",
    origin,
  );
  // Lightpanda cannot load Chat's CSS module scripts, so this fixture composes
  // the production Chat controls in a styleless surface. Canvas runs through
  // its production entry in a second workspace so iframe history stays out of
  // the session-navigation scenario.
  await Promise.all([
    mkdir(canvasRoot),
    symlink(join(repositoryRoot, "node_modules"), join(root, "node_modules")),
  ]);
  await Promise.all([
    writeFile(
      registryPath,
      JSON.stringify({
        version: 1,
        workspaces: [
          { id: "reference", manifest: "./uix.workspace.json" },
          { id: "canvas", manifest: "./canvas/uix.workspace.json" },
        ],
      }),
    ),
    writeFile(
      manifestPath,
      JSON.stringify({
        name: "Browser fixture",
        features: [{ entry: "./chat.ts", settings: {} }],
        settings: {
          keybindings: {
            "uix.session.new": "mod+n",
          },
        },
      }),
    ),
    writeFile(
      canvasManifestPath,
      JSON.stringify({
        name: "Canvas browser fixture",
        features: [{ entry: canvasEntryPath, settings: {} }],
        settings: {},
      }),
    ),
    writeFile(
      chatEntryPath,
      [
        'import { defineFeature } from "@uix/api/feature";',
        "export const feature = defineFeature({",
        '  id: "chat",',
        '  workspace: () => ({ surfaces: ["./chat-surface.tsx"] }),',
        "});",
      ].join("\n"),
    ),
    writeFile(
      chatSurfacePath,
      browserChatSurfaceSource(chatComposerPath, sessionPillPath),
    ),
    writeFile(pandaScriptPath, pandaScript),
  ]);

  const serverOutputRoot = join(root, "server-build");
  await buildIsolatedServer(serverOutputRoot);
  return {
    root,
    registryPath,
    dataDir,
    pandaScriptPath,
    serverEntry: join(serverOutputRoot, "index.mjs"),
  };
}

function browserChatSurfaceSource(
  chatComposerPath: string,
  sessionPillPath: string,
): string {
  return [
    'import { useEffect, useState } from "react";',
    'import { agentChannels } from "@uix/api/agent-channels";',
    'import { defineSurface, useWorkspaceSession } from "@uix/api/workspace";',
    `import { ChatComposer } from ${JSON.stringify(chatComposerPath)};`,
    `import { SessionPill } from ${JSON.stringify(sessionPillPath)};`,
    "function BrowserChat() {",
    "  const { loadActiveHistory, sessionSelectionVersion } = useWorkspaceSession();",
    "  const [hydrated, setHydrated] = useState(false);",
    '  const [submission, setSubmission] = useState("");',
    "  useEffect(() => {",
    "    let current = true;",
    "    setHydrated(false);",
    "    void loadActiveHistory().then(() => {",
    "      if (current) setHydrated(true);",
    "    });",
    "    return () => { current = false; };",
    "  }, [loadActiveHistory, sessionSelectionVersion]);",
    "  return <div>",
    '    <div data-browser-chat-state={hydrated ? "hydrated" : "loading"} />',
    "    <ChatComposer",
    "      canStop={false}",
    "      isStopping={false}",
    "      onCancel={() => undefined}",
    "      onSubmit={setSubmission}",
    "    />",
    '    <output id="browser-chat-submission">{submission}</output>',
    "    <SessionPill />",
    "  </div>;",
    "}",
    "export const surface = defineSurface({",
    '  name: "chat",',
    "  contract: agentChannels,",
    "  render: () => <BrowserChat />",
    "});",
  ].join("\n");
}

async function buildIsolatedServer(outputRoot: string): Promise<void> {
  const buildModuleUrl = pathToFileURL(
    join(repositoryRoot, "hosts/server/build.config.mjs"),
  ).href;
  const program = `import(${JSON.stringify(buildModuleUrl)}).then(({ buildServer }) => buildServer(${JSON.stringify(outputRoot)}))`;
  await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", program],
    { cwd: repositoryRoot },
  );
}

async function startServer(
  fixture: BrowserFixture,
  port: number,
): Promise<ChildProcessFixture> {
  const server = new ChildProcessFixture(
    process.execPath,
    [fixture.serverEntry],
    {
      cwd: fixture.root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        UIX_LOG_LEVEL: "info",
        UIX_PUBLIC_ORIGIN: `http://127.0.0.1:${String(port)}`,
        UIX_SERVER_DATA_DIR: fixture.dataDir,
        UIX_SERVER_HOST: "127.0.0.1",
        UIX_SERVER_PORT: String(port),
        UIX_SERVER_REGISTRY: fixture.registryPath,
      },
    },
  );
  try {
    await server.waitForStdout('"msg":"server_started"', 20_000);
    return server;
  } catch (error) {
    await server.stop();
    throw error;
  }
}

async function setSessionTitleThroughProtocol(
  origin: string,
  sessionId: string,
): Promise<void> {
  const socket = new WebSocket(
    `${origin.replace(/^http/, "ws")}/workspaces/reference/sessions/${encodeURIComponent(sessionId)}`,
  );
  const requestId = "browser-reconnect-title";
  try {
    await new Promise<void>((resolveRequest, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out updating the reconnect session title"));
      }, 15_000);
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Protocol WebSocket failed"));
      });
      socket.addEventListener("message", (event) => {
        let message: {
          readonly type?: unknown;
          readonly id?: unknown;
          readonly code?: unknown;
        };
        try {
          message = JSON.parse(String(event.data)) as typeof message;
        } catch (error) {
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (message.type === "ready") {
          socket.send(
            JSON.stringify({
              type: "request",
              id: requestId,
              channel: "agent.set_session_title",
              payload: { sessionId, title: "After reconnect" },
            }),
          );
          return;
        }
        if (message.id !== requestId) return;
        clearTimeout(timeout);
        if (message.type === "response") resolveRequest();
        else
          reject(
            new Error(`Session title update failed: ${String(message.code)}`),
          );
      });
    });
  } finally {
    socket.close(1000, "Protocol fixture complete");
  }
}

function readRestartSessionId(output: string): string {
  const match = /UIX_BROWSER_RESTART:([^\s]+)/.exec(output);
  if (!match?.[1]) throw new Error("Browser restart marker had no session id");
  return match[1];
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to reserve a loopback port");
  }
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClose();
    });
  });
  return address.port;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
