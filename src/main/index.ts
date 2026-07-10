// main process.
//
// Owns App lifecycle: the shell boots, then either opens a workspace
// directly (explicit UIX_WORKSPACE target, or a cwd that holds a manifest)
// or shows the start picker, which supplies the workspace to open. One
// open workspace per App instance (v1); everything workspace-bound lives
// in openWorkspace().
//
// All registrations (IPC handlers, app events, window events) flow
// through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `appBag`. One dispose on `will-quit` tears the whole
// tree down. See docs/architecture/conventions.md.

import { app, BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

import { type AgentEvent, agentChannels } from "@uix/api/agent-channels";
import {
  Channels,
  type PickerActionResult,
  type PickerCreateRequest,
  type PickerOpenRequest,
  type PickerState,
  type ReloadResult,
  uixChannels,
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
import { registerFeaturePreflightContributions } from "./features/contributions";
import {
  loadFeatures,
  type ActivationResult,
  type FeatureSources,
  type FeatureSubstrate,
} from "./features/loader";
import {
  readWorkspaceManifest,
  WorkspaceManifestFileName,
} from "./features/manifest";
import { scaffoldWorkspace } from "./features/scaffold";
import { SurfaceModulePipeline } from "./features/surface-pipeline";
import { SurfaceRegistry } from "./features/surfaces";
import { createRecentsStore, type RecentsStore } from "./recents";
import {
  registerResourceContributions,
  ResourceRegistry,
} from "./resources/registry";
import { resolveWorkspace, type Workspace } from "./workspace";
import * as ipc from "./ipc";
import {
  disposable,
  DisposableBag,
  installProcessHandlers,
  onApp,
  onWindow,
} from "./lifecycle";
import { createLogger } from "./log";
import {
  agentWorkspaceSettings,
  AgentSettingsNamespace,
} from "./agent/settings";
import { SettingsRegistry } from "./settings-registry";
import { WorkspaceManifestStore } from "./workspace-manifest-store";
import { createWorkspaceSettings } from "./workspace-settings";

const isDev = !app.isPackaged;
const LocalWorkspaceId = "local";

// Preflight declarations must land before app ready; today that's just the
// substrate resource protocol (no feature is loaded this early — manifest
// features are runtime contributions by definition).
registerFeaturePreflightContributions([]);

function createShellWindow(page: "index" | "picker"): BrowserWindow {
  const size =
    page === "picker"
      ? { width: 560, height: 480, resizable: false }
      : { width: 1100, height: 720 };
  const win = new BrowserWindow({
    ...size,
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
    void win.loadURL(page === "picker" ? `${devUrl}/picker.html` : devUrl);
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`));
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

/**
 * Boot the substrate against a workspace and open its window. Everything
 * workspace-bound — state root, registries, agent driver, feature load,
 * reload handler — lives here; the shell above it only decides *which*
 * workspace to open.
 */
async function openWorkspace(
  appBag: DisposableBag,
  recents: RecentsStore,
  workspace: Workspace,
): Promise<void> {
  // Raw IPC payloads spill to a per-run file under the state root; path is
  // logged as `ipc_log_file` when armed.
  ipc.initLogFile(workspace.stateRoot);

  const documents = createLocalDocumentStoreFactory(workspace.stateRoot);
  const workspaceManifest = appBag.add(
    new WorkspaceManifestStore(workspace.manifestPath),
  );
  const settingsRegistry = appBag.add(new SettingsRegistry());
  const workspaceSettings = createWorkspaceSettings(
    workspaceManifest,
    settingsRegistry,
    { [AgentSettingsNamespace]: agentWorkspaceSettings },
  );

  // The feature composition lives under its own child scope so reload can
  // tear down the feature subtree without touching app-lifetime process
  // handlers, the window, the agent driver, or IPC registrations.
  const featuresBag = appBag.add(new DisposableBag());

  // The manifest is optional (a dir target without one loads no features).
  // Existence is checked per pass so a manifest created after boot is
  // picked up by /reload.
  const manifestPath = workspace.manifestPath;

  let mainWindow: BrowserWindow | null = createShellWindow("index");
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
  const surfaces = new SurfaceRegistry();

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
    // Lazy handle: the `agent` scope registers during the settings reload
    // inside loadFeatures(), before any driver method can read it.
    agentSettings: workspaceSettings.forScope(AgentSettingsNamespace),
    onStatusChange: (status) => {
      agentPublisher.status_changed(status);
    },
  });
  appBag.add(driver);

  // Substrate workspace channels under the reserved `uix` id: the surface
  // composition the renderer mounts, plus the changed signal fired after
  // every load pass so the page re-fetches. The pipeline bundles each
  // registered surface entry into a servable module; its routes live on the
  // substrate origin (uix-resource://uix.<ws>) — the only origin the page's
  // CSP lets scripts and styles load from.
  const surfacePipeline = new SurfaceModulePipeline(LocalWorkspaceId);
  appBag.add(
    registerResourceContributions(
      resources,
      "uix",
      surfacePipeline.resourceContributions(),
    ),
  );
  const uixPublisher = createFeatureEventPublisherFactory(
    "uix",
    channels,
  ).createPublisher(uixChannels);
  appBag.add(
    disposable(
      settingsRegistry.onAnyChange((scopeId, key, value) => {
        uixPublisher.setting_changed({ featureId: scopeId, key, value });
      }),
    ),
  );
  appBag.add(
    registerChannelContributions(channels, "uix", [
      withHandlers(uixChannels, {
        surfaces: {
          handle: async () => ({
            surfaces: await surfacePipeline.buildAll(surfaces.list()),
            manifestPath,
            manifestFound: fs.existsSync(manifestPath),
          }),
        },
        get_setting: {
          handle: (req) => settingsRegistry.get(req.featureId, req.key),
        },
        set_setting: {
          handle: (req) => {
            settingsRegistry.set(req.featureId, req.key, req.value);
          },
        },
      }),
    ]),
  );

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
        list_models: {
          handle: async () => ({ models: await driver.listModels() }),
        },
        agent_status: {
          handle: () => driver.status(),
        },
        select_model: {
          handle: (ref) => driver.selectModel(ref),
        },
      }),
    ]),
  );

  // One load pass activates the whole composition — the manifest's entries,
  // in manifest order — all under featuresBag, so reload re-runs everything.
  // Where feature value-imports of @uix/api resolve. In dev this is the
  // repo's source; a packaged app ships the API source with the feature
  // templates (packaging arc) — until then the alias is simply absent there
  // and features can only type-import the API.
  const apiModuleDir = join(app.getAppPath(), "src/api");
  const substrate: FeatureSubstrate = {
    documents,
    settings: workspaceSettings,
    channels,
    ...(fs.existsSync(apiModuleDir) && { apiModuleDir }),
    registries: {
      resources,
      channels,
      agentTools,
      turnState,
      agentContext,
      surfaces,
    },
  };
  const currentSources = (): FeatureSources => ({
    ...(fs.existsSync(manifestPath) && { manifestPath }),
  });

  // A bad manifest must not brick the app: log it loudly and boot with no
  // features — the pilot can then fix the manifest and /reload. Reload
  // keeps strict semantics (a bad manifest rejects, tree intact).
  let activation: ActivationResult;
  try {
    activation = await loadFeatures(currentSources(), featuresBag, substrate);
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    createLogger("features").error({ err: error.message }, "manifest_failed");
    activation = { loaded: [], failed: [] };
  }
  createLogger("features").debug(
    { loaded: activation.loaded.length, failed: activation.failed.length },
    "activation_complete",
  );
  uixPublisher.surfaces_changed({});

  // Record the recent by manifest name (best-effort: a workspace without a
  // manifest isn't listable, and a bad manifest was already logged above).
  if (fs.existsSync(manifestPath)) {
    try {
      const { manifest } = await readWorkspaceManifest(manifestPath);
      recents.record({ manifestPath, name: manifest.name });
    } catch {
      recents.record({ manifestPath, name: basename(workspace.stateRoot) });
    }
  }

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
        uixPublisher.surfaces_changed({});
        const piReloaded = await driver.reload();
        const failures = featureResult.failed.map((f) => ({
          feature: f.displayName,
          entry: f.entry,
          error: f.error.message,
        }));
        reloadLog.debug(
          {
            featuresLoaded: featureResult.loaded.length,
            featuresFailed: featureResult.failed.length,
            failures,
            piReloaded,
          },
          "reload_completed",
        );
        return {
          featuresLoaded: featureResult.loaded.length,
          featuresFailed: featureResult.failed.length,
          failures,
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
        mainWindow = createShellWindow("index");
        appBag.add(
          onWindow(mainWindow, "closed", () => {
            mainWindow = null;
          }),
        );
      }
    }),
  );
}

/**
 * The start picker: a small shell window (not a feature, not a workspace
 * page) offering recents and create-new. Its IPC handlers live in a child
 * bag disposed on transition, so the workspace boot starts clean.
 */
function openPicker(appBag: DisposableBag, recents: RecentsStore): void {
  const pickerBag = appBag.add(new DisposableBag());
  const win = createShellWindow("picker");

  // Respond to the invoke first, then tear the picker down and boot the
  // workspace — disposing the handler that is currently answering would
  // race its own response.
  const transition = (target: string): void => {
    setImmediate(() => {
      pickerBag[Symbol.dispose]();
      if (!win.isDestroyed()) win.close();
      openWorkspace(appBag, recents, resolveWorkspace(target)).catch(
        (thrown: unknown) => {
          const error =
            thrown instanceof Error ? thrown : new Error(String(thrown));
          createLogger("main").error(
            { err: error.message, stack: error.stack },
            "workspace_open_failed",
          );
        },
      );
    });
  };

  pickerBag.add(
    ipc.handle<void, PickerState>(Channels.pickerState, () => ({
      recents: recents.list(),
    })),
  );

  pickerBag.add(
    ipc.handle<PickerOpenRequest, PickerActionResult>(
      Channels.pickerOpen,
      (req) => {
        if (!fs.existsSync(req.manifestPath)) {
          return { ok: false, error: "That workspace no longer exists." };
        }
        transition(req.manifestPath);
        return { ok: true };
      },
    ),
  );

  pickerBag.add(
    ipc.handle<PickerCreateRequest, PickerActionResult>(
      Channels.pickerCreate,
      async (req) => {
        const result = await dialog.showOpenDialog(win, {
          title: "Choose a workspace folder",
          buttonLabel: "Use folder",
          properties: ["openDirectory", "createDirectory"],
        });
        const dir = result.filePaths[0];
        if (result.canceled || !dir) return { ok: false, canceled: true };

        // A folder that already holds a manifest is an existing workspace:
        // adopt it rather than overwriting the user's composition. A fresh
        // one is scaffolded with editable copies of the default features;
        // a failed dep install still opens (the broken feature lands in
        // `failed[]`), but a failed copy/write keeps the picker up.
        const manifestPath = join(dir, WorkspaceManifestFileName);
        if (!fs.existsSync(manifestPath)) {
          const name = req.name.trim() || basename(dir);
          try {
            const { installError } = await scaffoldWorkspace({
              templatesDir: join(__dirname, "../../src/features"),
              workspaceDir: dir,
              name,
            });
            if (installError) {
              createLogger("main").warn(
                { err: installError.message, workspaceDir: dir },
                "scaffold_install_failed",
              );
            }
          } catch (thrown) {
            const error =
              thrown instanceof Error ? thrown : new Error(String(thrown));
            createLogger("main").error(
              { err: error.message, workspaceDir: dir },
              "scaffold_failed",
            );
            return {
              ok: false,
              error: `Could not create the workspace: ${error.message}`,
            };
          }
        }
        transition(manifestPath);
        return { ok: true };
      },
    ),
  );
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
  // that escapes the synchronous call stack — a feature's
  // interval throwing, a stray promise rejection in cockpit code.
  // They go in early so they're armed before any user code runs.
  appBag.add(installProcessHandlers(createLogger("main")));

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

  const recents = createRecentsStore(
    join(app.getPath("userData"), "recent-workspaces.json"),
  );

  // Which workspace? An explicit target (UIX_WORKSPACE — manifest path or
  // workspace dir) opens directly; so does a cwd that already holds a
  // manifest (the repo dev flow). Otherwise the start picker decides.
  const envTarget = process.env["UIX_WORKSPACE"];
  if (envTarget) {
    await openWorkspace(appBag, recents, resolveWorkspace(envTarget));
    return;
  }
  const cwdWorkspace = resolveWorkspace();
  if (fs.existsSync(cwdWorkspace.manifestPath)) {
    await openWorkspace(appBag, recents, cwdWorkspace);
    return;
  }
  openPicker(appBag, recents);
});
