// main process.
//
// Owns app lifecycle, creates the BrowserWindow, and registers the IPC
// channels declared in src/shared/ipc.ts.
//
// All registrations (IPC handlers, app events, window events) flow
// through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `appBag`. One dispose on `will-quit` tears the whole
// tree down. See docs/architecture/conventions.md.

import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";

import {
  type AgentEvent,
  agentChannels,
  Channels,
  type ReloadResult,
} from "../shared/ipc";
import { createAgentDriver } from "./agent/driver";
import { AgentContextRegistry } from "./agent-context/registry";
import {
  createAgentToolInstaller,
  AgentToolRegistry,
} from "./agent-tools/registry";
import { withHandlers } from "@uix/api/channels";
import {
  ChannelRegistry,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./channels/registry";
import { TurnStateRegistry } from "./turn-state/registry";
import { createLocalDocumentStoreFactory } from "./documents/store";
import { getBundledFeatures } from "./features/bundled";
import { registerFeaturePreflightContributions } from "./features/contributions";
import {
  loadFeatures,
  type FeatureSources,
  type FeatureSubstrate,
} from "./features/loader";
import { ResourceRegistry } from "./resources/registry";
import { resolveWorkspace } from "./workspace";
import * as ipc from "./ipc";
import {
  DisposableBag,
  installProcessHandlers,
  onApp,
  onWindow,
} from "./lifecycle";
import { createLogger } from "./log";

const isDev = !app.isPackaged;
const bundledFeatures = getBundledFeatures();
const LocalWorkspaceId = "local";

registerFeaturePreflightContributions(bundledFeatures);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: "UIX",
    icon: join(__dirname, "../../src/shared/assets/icon-black-large.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

// Level policy: what the chat displays is info; plumbing is debug; partials
// are trace. The IPC boundary already records every crossing at debug/trace,
// so these info lines exist purely to keep the human-visible conversation
// readable in the default log.
function logChatContent(event: AgentEvent): void {
  if (event.type !== "transcript_append" && event.type !== "transcript_replace")
    return;
  const item = event.item;
  if (item.kind === "user") {
    createLogger("chat").info({ text: item.text }, "user_message");
    return;
  }
  // The completion replace logs once; the same-text rekey replace (carries
  // previousId) and streaming partials do not.
  if (
    item.kind === "assistant" &&
    item.complete &&
    event.type === "transcript_replace" &&
    event.previousId === undefined
  ) {
    createLogger("chat").info({ text: item.text }, "assistant_message");
  }
}

void app.whenReady().then(async () => {
  // One bag for everything that lives as long as the app does.
  // Anything we register goes in here; `will-quit` disposes it.
  const appBag = new DisposableBag();

  app.setName("UIX");

  if (process.platform === "darwin") {
    app.dock?.setIcon(
      join(__dirname, "../../src/shared/assets/icon-black-large.png"),
    );
  }

  // Process-level error handlers are the catch-all for anything
  // that escapes the synchronous call stack — an extension's
  // interval throwing, a stray promise rejection in cockpit code.
  // They go in early so they're armed before any user code runs.
  appBag.add(installProcessHandlers(createLogger("main")));

  // One resolved workspace: stateRoot pins canvases + the session file; agentCwd
  // is what the agent's tools operate against (see ./workspace.ts). The target
  // is a manifest path or workspace dir — `UIX_WORKSPACE` for dev flows, the
  // picker in M3 — defaulting to the cwd.
  const workspace = resolveWorkspace(process.env["UIX_WORKSPACE"]);

  // Raw IPC payloads spill to a per-run file under the state root; path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  const documents = createLocalDocumentStoreFactory(workspace.stateRoot);

  // The feature composition lives under its own child scope so reload can
  // tear down the feature subtree without touching app-lifetime process
  // handlers, the window, the agent driver, or IPC registrations.
  const featuresBag = appBag.add(new DisposableBag());

  // The manifest is optional until the picker exists: a workspace dir without
  // one loads bundled features only. Existence is checked per pass so a
  // manifest created after boot is picked up by /reload.
  const manifestPath = workspace.manifestPath;

  let mainWindow: BrowserWindow | null = createWindow();
  appBag.add(
    onWindow(mainWindow, "closed", () => {
      mainWindow = null;
    }),
  );

  // Facet registries. Features contribute data into these; substrate installers
  // adapt the registries to pi when the agent session opens.
  const resources = appBag.add(
    new ResourceRegistry({ workspaceId: LocalWorkspaceId }),
  );
  const channels = new ChannelRegistry({
    transportHandle(canonicalId, fn, logOpts) {
      return ipc.handle(canonicalId, fn, logOpts);
    },
    publish(channel, payload) {
      for (const win of BrowserWindow.getAllWindows()) {
        ipc.send(win, channel, payload);
      }
    },
  });
  const turnState = new TurnStateRegistry();
  const agentTools = new AgentToolRegistry();
  const agentContext = new AgentContextRegistry();

  // Agent publisher: created early so the driver can emit events through the
  // channel transport. The registry's publish transport already broadcasts to
  // all windows.
  const agentPublisher = createFeatureEventPublisherFactory(
    "agent",
    channels,
  ).createPublisher(agentChannels);

  const driver = createAgentDriver({
    onEvent: (event) => {
      logChatContent(event);
      agentPublisher.event(event);
    },
    workspace,
    turnState,
    agentContext,
    agentInstallers: [createAgentToolInstaller(agentTools)],
  });
  appBag.add(driver);

  // Register substrate agent channels before feature contributions so the
  // prompt/history handlers can close over the driver.
  appBag.add(
    registerChannelContributions(channels, "agent", [
      withHandlers(agentChannels, {
        prompt: {
          handle: (req) => {
            // Fire and forget — the renderer subscribes to the event
            // stream, and the invoke resolves once the prompt has been
            // accepted.
            void driver.prompt(req.text);
          },
        },
        history: {
          handle: () => driver.history(),
          log: {
            // A snapshot is the entire persisted transcript, already on
            // disk — the wire log records a pointer instead of duplicating
            // it.
            describeResult: (snap) => ({
              items: snap.items.length,
              ref: driver.sessionFile(),
            }),
          },
        },
      }),
    ]),
  );

  // One load pass activates the whole composition — bundled defaults claim
  // their ids first, then the manifest's entries — all under featuresBag, so
  // reload re-runs everything.
  const substrate: FeatureSubstrate = {
    documents,
    channels,
    registries: { resources, channels, agentTools, turnState, agentContext },
  };
  const currentSources = (): FeatureSources => ({
    ...(fs.existsSync(manifestPath) && { manifestPath }),
    bundled: bundledFeatures,
  });

  // A bad manifest must not brick the app: log it loudly and boot with
  // bundled features only — the pilot can then fix the manifest and /reload.
  // Reload keeps strict semantics (a bad manifest rejects, tree intact).
  let activation;
  try {
    activation = await loadFeatures(currentSources(), featuresBag, substrate);
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    createLogger("features").error({ err: error.message }, "manifest_failed");
    activation = await loadFeatures(
      { bundled: bundledFeatures },
      featuresBag,
      substrate,
    );
  }
  createLogger("features").debug(
    { loaded: activation.loaded.length, failed: activation.failed.length },
    "activation_complete",
  );

  // Eager, off the boot path: loads the session file so getHistory() resolves
  // fast. The auth-bearing live agent stays lazy until the first prompt.
  driver.init();

  appBag.add(
    ipc.handle<void, ReloadResult>(Channels.reload, async () => {
      const reloadLog = createLogger("main");
      reloadLog.debug({}, "reload_started");

      try {
        const featureResult = await loadFeatures(
          currentSources(),
          featuresBag,
          substrate,
        );
        const piReloaded = await driver.reload();
        reloadLog.debug(
          {
            featuresLoaded: featureResult.loaded.length,
            featuresFailed: featureResult.failed.length,
            piReloaded,
          },
          "reload_completed",
        );
        return {
          featuresLoaded: featureResult.loaded.length,
          featuresFailed: featureResult.failed.length,
          piReloaded,
        };
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        reloadLog.error(
          { err: error.message, stack: error.stack },
          "reload_failed",
        );
        throw error;
      }
    }),
  );

  appBag.add(
    onApp("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        appBag.add(
          onWindow(mainWindow, "closed", () => {
            mainWindow = null;
          }),
        );
      }
    }),
  );

  appBag.add(
    onApp("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    }),
  );

  // Dispose the whole tree on shutdown. Registered raw (not via
  // onApp) because the listener's job IS to dispose appBag — putting
  // it in the bag would make teardown circular. The handler is a
  // one-shot process-end event with no useful moment to remove it
  // anyway, so the lack of cleanup is fine.
  // eslint-disable-next-line no-restricted-syntax -- documented exception
  app.on("will-quit", () => {
    appBag[Symbol.dispose]();
  });
});
