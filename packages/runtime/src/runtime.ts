// The host-neutral workspace runtime composition root.
//
// Instantiates one workspace's substrate: document store, manifest store,
// settings, feature loader, facet registries, agent driver, surface pipeline,
// substrate channel handlers, and the reload coordinator. The host supplies
// the transport ports (channel transport, resource delivery) and capabilities
// (openExternal, profile dir, api dir). The runtime can be described without
// Electron: nothing here imports a host platform.
//
// The workspace-scoped bag owns everything the runtime creates. Disposing the
// runtime tears the whole workspace tree down, in LIFO order.

import fs from "node:fs";

import { agentChannels, type AgentEvent } from "@uix/api/agent-channels";
import { withHandlers } from "@uix/api/channels";
import { type ReloadResult, substrateChannels } from "#shared/ipc";

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
  type ChannelTransportPublisher,
  type ChannelTransportRegistrar,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./channel-registry";
import { createLocalDocumentStoreFactory } from "./document-store";
import {
  type ActivationResult,
  type FeatureSources,
  type FeatureSubstrate,
  loadFeatures,
} from "./features/loader";
import { SurfaceModulePipeline } from "./features/surface-pipeline";
import { SurfaceRegistry } from "./features/surfaces";
import { createKeybindingRequestHandlers } from "./keybindings/requests";
import { keybindingsWorkspaceSettings } from "./keybindings/settings";
import { disposable, DisposableBag } from "./lifecycle";
import { createLogger } from "./log";
import {
  registerResourceContributions,
  ResourceRegistry,
  type ResourceTransportRegistrar,
} from "./resource-registry";
import { SettingsRegistry } from "./settings-registry";
import { TurnStateRegistry } from "./turn-state";
import { WorkspaceManifestStore } from "./workspace/manifest-store";
import { createWorkspaceReloadCoordinator } from "./workspace/reload";
import type { Workspace } from "./workspace/roots";
import { createWorkspaceSettings } from "./workspace/settings";

const log = createLogger("runtime");

const LocalWorkspaceId = "local";

export interface ChannelTransportPort {
  /** Register one request handler endpoint on the host transport. */
  registerHandler: ChannelTransportRegistrar;
  /** Publish one event to every connected client of the host transport. */
  publish: ChannelTransportPublisher;
}

export interface WorkspaceRuntimeCapabilities {
  /** Open a URL in the system browser. */
  openExternal: (url: string) => void;
  /** App-owned Pi profile directory. The host decides its location. */
  piProfileDir: string;
  /**
   * On-disk dir of the `@uix/api` implementation feature imports resolve
   * to. Supplied by the host. It is environment knowledge, not runtime
   * logic. When absent, features can only type-import the API.
   */
  apiModuleDir?: string;
}

export interface WorkspaceRuntimePorts {
  /** Host-selected channel transport (Electron IPC today, live bus later). */
  transport: ChannelTransportPort;
  /** Host-selected resource delivery (Electron protocol today, HTTP later). */
  resourceTransport: ResourceTransportRegistrar;
  capabilities: WorkspaceRuntimeCapabilities;
}

/**
 * One running workspace runtime. The host creates it with
 * `createWorkspaceRuntime`, calls `init()` once, binds its own chrome
 * (reload trigger, recents) to `reload()`/`init()` results, and disposes it
 * when the workspace closes.
 */
export interface WorkspaceRuntime extends Disposable {
  readonly workspace: Workspace;
  /** Load the feature composition and start the agent driver. */
  init(): Promise<ActivationResult>;
  /** Reload the feature composition and Pi resources. */
  reload(): Promise<ReloadResult>;
}

// Level policy: what the chat displays is info. Plumbing is debug. Partials
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
  // The completion replace logs once. The same-text rekey replace (includes
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
 * Create one workspace runtime. All workspace-bound construction happens
 * here. The host shell only decides which workspace to open and provides
 * the transport ports.
 */
export function createWorkspaceRuntime(
  workspace: Workspace,
  ports: WorkspaceRuntimePorts,
): WorkspaceRuntime {
  const bag = new DisposableBag();

  const documents = createLocalDocumentStoreFactory(workspace.stateRoot);
  const workspaceManifest = bag.add(
    new WorkspaceManifestStore(workspace.manifestPath),
  );
  const settingsRegistry = bag.add(new SettingsRegistry());
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
  // process handlers, the agent driver, or the host bindings.
  const featuresBag = bag.add(new DisposableBag());

  // The manifest is optional (a dir target without one loads no features).
  // The reload pass checks existence each time, so /reload picks up a
  // manifest created after boot.
  const manifestPath = workspace.manifestPath;

  // Facet registries. Features contribute data into these. Substrate installers
  // adapt the registries to Pi when the agent session opens.
  const resources = bag.add(
    new ResourceRegistry({
      workspaceId: LocalWorkspaceId,
      transportRegistrar: ports.resourceTransport,
    }),
  );
  const channels = new ChannelRegistry({
    transportRegistrar: ports.transport.registerHandler,
    publish: ports.transport.publish,
  });
  const turnState = new TurnStateRegistry();
  const agentTools = new AgentToolRegistry();
  const agentSystemPrompt = new AgentSystemPromptRegistry();
  const agentSkills = new AgentSkillRegistry();
  const agentContext = new AgentContextRegistry();
  const surfaces = new SurfaceRegistry();

  // Agent publisher: created early so the driver can emit events through the
  // channel transport. The registry's publish transport already broadcasts to
  // all connected clients.
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
    piProfileDir: ports.capabilities.piProfileDir,
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
    openExternal: ports.capabilities.openExternal,
    onProviderAuthFlowSnapshot: (snapshot) => {
      agentPublisher.provider_auth_flow_changed(snapshot);
    },
    onModelAvailabilityChange: () => {
      agentPublisher.model_availability_changed();
    },
  });
  bag.add(driver);

  // Substrate workspace channels under the reserved `uix` id: the surface
  // composition the renderer mounts, plus the changed signal fired after
  // every load pass so the page re-fetches. The pipeline bundles each
  // registered surface entry into a servable module. Its routes live on the
  // substrate origin (uix-resource://uix.<ws>). The only origin the page's
  // CSP lets scripts and styles load from.
  const surfacePipeline = new SurfaceModulePipeline(LocalWorkspaceId);
  bag.add(
    registerResourceContributions(
      resources,
      "uix",
      surfacePipeline.createResourceContributions(),
    ),
  );
  const substratePublisher = createFeatureEventPublisherFactory(
    "uix",
    channels,
  ).createPublisher(substrateChannels);
  const keybindingSettings = workspaceSettings.forNamespace(
    keybindingsWorkspaceSettings,
  );
  const keybindingRequestHandlers = createKeybindingRequestHandlers({
    getBindingsSnapshot: () => keybindingSettings.getSnapshot(),
    replaceBindings: (candidate) => keybindingSettings.replace(candidate),
    publishBindingsChanged: (bindings) => {
      substratePublisher.keybindings_changed(bindings);
    },
  });
  bag.add(
    disposable(
      settingsRegistry.onAnyChange((scopeId, key, value) => {
        substratePublisher.setting_changed({ featureId: scopeId, key, value });
      }),
    ),
  );
  bag.add(
    registerChannelContributions(channels, "uix", [
      withHandlers(substrateChannels, {
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
  bag.add(
    registerChannelContributions(channels, "agent", [
      withHandlers(agentChannels, {
        prompt: {
          handler: (req) => {
            // Fire and forget. The renderer subscribes to the event
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
        tool_catalog: {
          handler: () => ({
            tools: agentTools.list().map(({ tool }) => ({
              name: tool.name,
              label: tool.label,
            })),
          }),
          log: {
            describeResponse: ({ tools }) => ({ toolCount: tools.length }),
          },
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

  // Where feature value-imports of @uix/api resolve. The host supplies the
  // dir (repo source in dev, packaged resources later). When absent,
  // features can only type-import the API.
  const apiModuleDir = ports.capabilities.apiModuleDir;
  const substrate: FeatureSubstrate = {
    documents,
    settings: workspaceSettings,
    channels,
    ...(apiModuleDir !== undefined &&
      fs.existsSync(apiModuleDir) && { apiModuleDir }),
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

  const reloadCoordinator = createWorkspaceReloadCoordinator({
    commitTurnState: () => driver.commitFeatureTurnState(),
    loadFeatures: () => loadFeatures(currentSources(), featuresBag, substrate),
    reloadPiResources: () => driver.reloadPiResources(),
    restoreTurnState: () => driver.restoreFeatureTurnState(),
    publishSurfacesChanged: () => {
      substratePublisher.surfaces_changed({});
    },
  });

  /**
   * Replaces the workspace's active feature composition and Pi resource tier:
   * commit turn state, re-activate features, reload Pi resources, restore
   * turn state, then publish surfaces_changed for the renderer. Shared by the
   * `uix:reload` channel and the workspace window menu.
   */
  async function reload(): Promise<ReloadResult> {
    log.debug({}, "reload_started");

    try {
      const { featureActivation, piResourcesReloaded, turnStateCommitted } =
        await reloadCoordinator.reload();
      if (!turnStateCommitted) {
        log.warn({}, "reload_turn_state_commit_skipped_restoration_pending");
      }
      const failures = featureActivation.failed.map((f) => ({
        feature: f.displayName,
        entry: f.entry,
        error: f.error.message,
      }));
      log.debug(
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
      log.error({ err: error.message, stack: error.stack }, "reload_failed");
      throw error;
    }
  }

  const runtime: WorkspaceRuntime = {
    workspace,
    async init(): Promise<ActivationResult> {
      // A bad manifest must not brick the app: log it loudly and boot with no
      // features. The user can then fix the manifest and /reload. Reload
      // keeps strict semantics (a bad manifest rejects, tree intact).
      let activation: ActivationResult;
      try {
        activation = await loadFeatures(
          currentSources(),
          featuresBag,
          substrate,
        );
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        createLogger("features").error(
          { err: error.message },
          "manifest_failed",
        );
        activation = { activated: [], failed: [] };
      }
      createLogger("features").debug(
        {
          activated: activation.activated.length,
          failed: activation.failed.length,
        },
        "activation_complete",
      );
      substratePublisher.surfaces_changed({});

      // Restoration must start after initial feature activation: the accepted
      // turn-state cell registry determines which selected-branch state is
      // retained and restored. The auth-bearing live agent stays lazy until
      // the first prompt.
      driver.init();

      return activation;
    },
    reload,
    [Symbol.dispose](): void {
      bag[Symbol.dispose]();
    },
  };

  return runtime;
}
