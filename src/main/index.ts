// Starts the Electron app, opens a workspace, and owns the lifetimes of its windows, features, and agent sessions.
//
// Owns App lifecycle: the shell boots, then either opens a workspace
// directly (explicit UIX_WORKSPACE target, or a cwd that holds a manifest)
// or shows the start picker, which provides the workspace to open. One
// open workspace per App instance (v1); everything workspace-bound lives
// in openWorkspace().
//
// All cleanup-requiring bindings (IPC handlers, app events, window events)
// flow through the helpers in src/main/ipc.ts and src/main/lifecycle.ts and
// land in a single `appBag`. One dispose on `will-quit` tears the whole
// tree down. See docs/architecture/conventions/lifetimes.md.

import fs from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

import { app, BrowserWindow, dialog, shell } from "electron";

import { agentChannels, type AgentEvent } from "@uix/api/agent-channels";
import { withHandlers } from "@uix/api/channels";

import { createAgentDriver } from "./agent/driver";
import { sessionWorkspaceSettings } from "./agent/session-settings";
import { agentWorkspaceSettings } from "./agent/settings";
import { AgentContextRegistry } from "./agent-context/registry";
import { AgentSkillRegistry } from "./agent-skill-registry";
import { AgentSystemPromptRegistry } from "./agent-system-prompt-registry";
import {
  AgentToolRegistry,
  createAgentToolInstaller,
} from "./agent-tools/registry";
import {
  ChannelRegistry,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./channel-registry";
import { createLocalDocumentStoreFactory } from "./document-store";
import { bindExternalWebLinks } from "./external-links";
import { registerFeaturePreflightContributions } from "./features/contributions";
import {
  type ActivationResult,
  type FeatureSources,
  type FeatureSubstrate,
  loadFeatures,
} from "./features/loader";
import { WorkspaceManifestFileName } from "./features/manifest";
import { scaffoldWorkspace } from "./features/scaffold";
import { SurfaceModulePipeline } from "./features/surface-pipeline";
import { SurfaceRegistry } from "./features/surfaces";
import * as ipc from "./ipc";
import { createKeybindingRequestHandlers } from "./keybindings/requests";
import { keybindingsWorkspaceSettings } from "./keybindings/settings";
import {
  disposable,
  DisposableBag,
  installProcessHandlers,
  onApp,
  onWindow,
} from "./lifecycle";
import { createLogger } from "./log";
import { createRecentsStore, type RecentsStore } from "./recents";
import {
  registerResourceContributions,
  ResourceRegistry,
} from "./resource-registry";
import { SettingsRegistry } from "./settings-registry";
import { TurnStateRegistry } from "./turn-state";
import { WorkspaceManifestStore } from "./workspace/manifest-store";
import { createWorkspaceReloadCoordinator } from "./workspace/reload";
import { resolveWorkspace, type Workspace } from "./workspace/roots";
import { createWorkspaceSettings } from "./workspace/settings";
import {
  Channels,
  type PickerActionResult,
  type PickerCreateRequest,
  type PickerOpenRequest,
  type PickerState,
  type ReloadResult,
  uixChannels,
} from "../shared/ipc";

const isDev = !app.isPackaged;
const LocalWorkspaceId = "local";

// Preflight declarations must land before app ready; today that's just the
// substrate resource protocol (no feature is loaded this early — manifest
// features are runtime contributions by definition).
registerFeaturePreflightContributions([]);

interface OpenShellWindowOptions {
  page: "index" | "picker";
  onClosed?: () => void;
}

function openShellWindow(
  parentLifetime: DisposableBag,
  options: OpenShellWindowOptions,
): BrowserWindow {
  const size =
    options.page === "picker"
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

  const windowBag = parentLifetime.add(new DisposableBag());
  windowBag.add(
    bindExternalWebLinks(win.webContents, (url) => shell.openExternal(url)),
  );
  windowBag.add(
    onWindow(win, "closed", () => {
      windowBag[Symbol.dispose]();
      options.onClosed?.();
    }),
  );

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devUrl) {
    void win.loadURL(
      options.page === "picker" ? `${devUrl}/picker.html` : devUrl,
    );
  } else {
    void win.loadFile(join(__dirname, `../renderer/${options.page}.html`));
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
  piProfileDir: string,
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
    [
      agentWorkspaceSettings,
      sessionWorkspaceSettings,
      keybindingsWorkspaceSettings,
    ],
  );

  // The feature composition lives under its own child scope so reload can
  // tear down the active feature composition without touching app-lifetime
  // process handlers, the window, the agent driver, or IPC handler bindings.
  const featuresBag = appBag.add(new DisposableBag());

  // The manifest is optional (a dir target without one loads no features).
  // Existence is checked per pass so a manifest created after boot is
  // picked up by /reload.
  const manifestPath = workspace.manifestPath;

  let mainWindow: BrowserWindow | null = null;
  mainWindow = openShellWindow(appBag, {
    page: "index",
    onClosed: () => {
      mainWindow = null;
    },
  });

  // Facet registries. Features contribute data into these; substrate installers
  // adapt the registries to Pi when the agent session opens.
  const resources = appBag.add(
    new ResourceRegistry({ workspaceId: LocalWorkspaceId }),
  );
  const channels = new ChannelRegistry({
    transportRegistrar(canonicalId, handler, logOpts) {
      return ipc.handle(canonicalId, handler, logOpts);
    },
    publish(channel, payload, logOpts) {
      for (const win of BrowserWindow.getAllWindows()) {
        ipc.send(win, channel, payload, {
          describePayload: logOpts?.describeEvent,
        });
      }
    },
  });
  const turnState = new TurnStateRegistry();
  const agentTools = new AgentToolRegistry();
  const agentSystemPrompt = new AgentSystemPromptRegistry();
  const agentSkills = new AgentSkillRegistry();
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
    piProfileDir,
    turnState,
    agentSystemPrompt,
    agentSkills,
    agentContext,
    agentInstallers: [createAgentToolInstaller(agentTools)],
    // Lazy handles: workspace scopes register during the settings reload
    // inside loadFeatures(), before any driver method can read them.
    agentSettings: workspaceSettings.forNamespace(agentWorkspaceSettings),
    sessionSettings: workspaceSettings.forNamespace(sessionWorkspaceSettings),
    onStatusChange: (status) => {
      agentPublisher.status_changed(status);
    },
    openExternal: (url) => shell.openExternal(url),
    onProviderAuthFlowSnapshot: (snapshot) => {
      agentPublisher.provider_auth_flow_changed(snapshot);
    },
    onModelAvailabilityChange: () => {
      agentPublisher.model_availability_changed();
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
      surfacePipeline.createResourceContributions(),
    ),
  );
  const uixPublisher = createFeatureEventPublisherFactory(
    "uix",
    channels,
  ).createPublisher(uixChannels);
  const keybindingSettings = workspaceSettings.forNamespace(
    keybindingsWorkspaceSettings,
  );
  const keybindingRequestHandlers = createKeybindingRequestHandlers({
    getBindingsSnapshot: () => keybindingSettings.getSnapshot(),
    replaceBindings: (candidate) => keybindingSettings.replace(candidate),
    publishBindingsChanged: (bindings) => {
      uixPublisher.keybindings_changed(bindings);
    },
  });
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
          handler: async () => ({
            surfaces: await surfacePipeline.buildAll(surfaces.list()),
            manifestPath,
            manifestFound: fs.existsSync(manifestPath),
          }),
        },
        get_setting: {
          handler: (req) => settingsRegistry.get(req.featureId, req.key),
        },
        set_setting: {
          handler: (req) => {
            settingsRegistry.set(req.featureId, req.key, req.value);
          },
        },
        reconcile_keybindings: {
          handler: (defaults) =>
            keybindingRequestHandlers.reconcileDefaults(defaults),
        },
        replace_keybindings: {
          handler: (candidate) =>
            keybindingRequestHandlers.replaceBindings(candidate),
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
          handler: (req) => {
            // Fire and forget — the renderer subscribes to the event
            // stream, and the invoke resolves once the prompt has been
            // accepted.
            void driver.prompt(req.text);
          },
        },
        session_history: {
          handler: ({ sessionId }) => driver.sessionHistory(sessionId),
          log: {
            // A snapshot is the entire persisted transcript, already on disk;
            // record only its durable identity and size at the crossing.
            describeResponse: ({ session, transcript }) => ({
              sessionId: session.sessionId,
              items: transcript.items.length,
            }),
          },
        },
        list_session_summaries: {
          handler: ({ limit }) => driver.listSessionSummaries(limit),
          log: {
            describeResponse: (sessions) => ({
              sessionIds: sessions.map((session) => session.sessionId),
            }),
          },
        },
        new_session: {
          handler: () => driver.newSession(),
        },
        switch_session: {
          handler: ({ sessionId }) => driver.switchSession(sessionId),
        },
        set_session_title: {
          handler: ({ sessionId, title }) =>
            driver.setSessionTitle(sessionId, title),
        },
        list_models: {
          handler: async () => ({ models: await driver.listModels() }),
        },
        set_model_favorite: {
          handler: async (update) => ({
            models: await driver.setModelFavorite(update),
          }),
        },
        agent_status: {
          handler: () => driver.getStatus(),
        },
        select_model: {
          handler: (ref) => driver.selectModel(ref),
        },
        list_auth_providers: {
          handler: async () => ({
            providers: await driver.listAuthProviders(),
          }),
        },
        current_provider_auth_flow: {
          handler: () => driver.getCurrentProviderAuthFlow() ?? null,
        },
        begin_provider_auth_flow: {
          handler: ({ providerId, authType }) =>
            driver.beginProviderAuthFlow(providerId, authType),
        },
        answer_provider_auth_flow: {
          handler: ({ flowId, promptId, value }) => {
            driver.answerProviderAuthFlow(flowId, promptId, value);
          },
        },
        open_provider_auth_link: {
          handler: ({ flowId, linkId }) =>
            driver.openProviderAuthLink(flowId, linkId),
        },
        cancel_provider_auth_flow: {
          handler: ({ flowId }) => {
            driver.cancelProviderAuthFlow(flowId);
          },
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
      agentSystemPrompt,
      agentSkills,
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
  let initialActivation: ActivationResult;
  try {
    initialActivation = await loadFeatures(
      currentSources(),
      featuresBag,
      substrate,
    );
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));
    createLogger("features").error({ err: error.message }, "manifest_failed");
    initialActivation = { activated: [], failed: [] };
  }
  createLogger("features").debug(
    {
      activated: initialActivation.activated.length,
      failed: initialActivation.failed.length,
    },
    "activation_complete",
  );
  uixPublisher.surfaces_changed({});

  // Record the recent by manifest name (best-effort: a workspace without a
  // manifest isn't listable, and a bad manifest was already logged above).
  if (fs.existsSync(manifestPath)) {
    recents.record({
      manifestPath,
      name: initialActivation.workspaceName ?? basename(workspace.stateRoot),
    });
  }

  // Restoration must start after initial feature activation: the accepted
  // turn-state cell registry determines which selected-branch state is
  // retained and restored. The auth-bearing live agent stays lazy until the
  // first prompt.
  driver.init();

  const reloadCoordinator = createWorkspaceReloadCoordinator({
    commitTurnState: () => driver.commitFeatureTurnState(),
    loadFeatures: () => loadFeatures(currentSources(), featuresBag, substrate),
    reloadPiResources: () => driver.reloadPiResources(),
    restoreTurnState: () => driver.restoreFeatureTurnState(),
    publishSurfacesChanged: () => {
      uixPublisher.surfaces_changed({});
    },
  });

  appBag.add(
    ipc.handle<unknown, ReloadResult>(Channels.reload, async () => {
      const reloadLog = createLogger("main");
      reloadLog.debug({}, "reload_started");

      try {
        const { featureActivation, piResourcesReloaded, turnStateCommitted } =
          await reloadCoordinator.reload();
        if (!turnStateCommitted) {
          reloadLog.warn(
            {},
            "reload_turn_state_commit_skipped_restoration_pending",
          );
        }
        const failures = featureActivation.failed.map((f) => ({
          feature: f.displayName,
          entry: f.entry,
          error: f.error.message,
        }));
        reloadLog.debug(
          {
            featuresActivated: featureActivation.activated.length,
            featuresFailed: featureActivation.failed.length,
            failures,
            piResourcesReloaded,
            turnStateCommitted,
          },
          "reload_completed",
        );
        return {
          featuresActivated: featureActivation.activated.length,
          featuresFailed: featureActivation.failed.length,
          failures,
          piResourcesReloaded,
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
      if (mainWindow === null) {
        mainWindow = openShellWindow(appBag, {
          page: "index",
          onClosed: () => {
            mainWindow = null;
          },
        });
      }
    }),
  );
}

/**
 * The start picker: a small shell window (not a feature, not a workspace
 * page) offering recents and create-new. Its IPC handlers live in a child
 * bag disposed on transition, so the workspace boot starts clean.
 */
function openPicker(
  appBag: DisposableBag,
  recents: RecentsStore,
  piProfileDir: string,
): void {
  const pickerBag = appBag.add(new DisposableBag());
  const win = openShellWindow(pickerBag, {
    page: "picker",
    onClosed: () => {
      pickerBag[Symbol.dispose]();
    },
  });

  // Respond to the invoke first, then tear the picker down and boot the
  // workspace — disposing the handler that is currently answering would
  // race its own response.
  const transition = (target: string): void => {
    setImmediate(() => {
      pickerBag[Symbol.dispose]();
      if (!win.isDestroyed()) win.close();
      openWorkspace(
        appBag,
        recents,
        resolveWorkspace(target),
        piProfileDir,
      ).catch((thrown: unknown) => {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        createLogger("main").error(
          { err: error.message, stack: error.stack },
          "workspace_open_failed",
        );
      });
    });
  };

  pickerBag.add(
    ipc.handle<unknown, PickerState>(Channels.pickerState, () => ({
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
              templatesDir: join(__dirname, "../../templates/workspace"),
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

  const userDataDir = app.getPath("userData");
  const piProfileDir = join(userDataDir, "pi");
  const recents = createRecentsStore(
    join(userDataDir, "recent-workspaces.json"),
  );

  // Which workspace? An explicit target (UIX_WORKSPACE — manifest path or
  // workspace dir) opens directly; so does a cwd that already holds a
  // manifest (the repo dev flow). Otherwise the start picker decides.
  const envTarget = process.env["UIX_WORKSPACE"];
  if (envTarget) {
    await openWorkspace(
      appBag,
      recents,
      resolveWorkspace(envTarget),
      piProfileDir,
    );
    return;
  }
  const cwdWorkspace = resolveWorkspace();
  if (fs.existsSync(cwdWorkspace.manifestPath)) {
    await openWorkspace(appBag, recents, cwdWorkspace, piProfileDir);
    return;
  }
  openPicker(appBag, recents, piProfileDir);
});
