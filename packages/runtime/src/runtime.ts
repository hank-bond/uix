// Composes the workspace substrate into one exactly-one-workspace runtime over host-provided dependencies.
//
// The host supplies the channel transport, the resource transport,
// openExternal, and the workspace target as injected dependencies. No
// Electron import exists anywhere in this package. A host may compose this
// runtime in process or behind a transport.

import fs from "node:fs";

import { agentChannels, type AgentEvent } from "@uix/api/agent-channels";
import { type FeatureEventPublisher, withHandlers } from "@uix/api/channels";
import type { ReloadResult } from "@uix/api/substrate-channels";
import { substrateChannels } from "@uix/api/substrate-channels";

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
import type {
  AttachmentContext,
  CanonicalRequest,
  CanonicalResponse,
} from "./dispatch";
import { createLocalDocumentStoreFactory } from "./document-store";
import type { EventScope, RuntimeEvent } from "./events";
import type {
  ActivationResult,
  FeatureSources,
  FeatureSubstrate,
} from "./features/loader";
import { loadFeatures } from "./features/loader";
import { SurfaceModulePipeline } from "./features/surface-pipeline";
import { SurfaceRegistry } from "./features/surfaces";
import { createKeybindingRequestHandlers } from "./keybindings/requests";
import { keybindingsWorkspaceSettings } from "./keybindings/settings";
import { disposable, DisposableBag } from "./lifecycle";
import { createLogger } from "./log";
import { WorkspaceManifestStore } from "./manifest-store";
import { createWorkspaceReloadCoordinator } from "./reload";
import {
  registerResourceContributions,
  ResourceRegistry,
  type ResourceTransportRegistrar,
} from "./resource-registry";
import type { Workspace } from "./roots";
import { SettingsRegistry } from "./settings-registry";
import { TurnStateRegistry } from "./turn-state";
import type {
  AttachmentId,
  RuntimeAttachment,
  SessionId,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime as WorkspaceRuntimeContract,
} from "./workspace";
import { toAgentInstanceId, toAttachmentId } from "./workspace";
import { createWorkspaceSettings } from "./workspace-settings";

/** The channel transport the host provides. */
export interface WorkspaceChannelTransportDependencies {
  transportRegistrar: ChannelTransportRegistrar;
  publish: ChannelTransportPublisher;
}

/** The dependencies a host provides. The runtime declares them, never imports them. */
export interface WorkspaceRuntimeDependencies {
  channelTransport: WorkspaceChannelTransportDependencies;
  /**
   * Resource serving on the reserved substrate origin. Omitted when the host
   * does not serve resources (the registry still owns routes, unbound).
   */
  resourceTransport?: ResourceTransportRegistrar;
  /** Opens only URLs provided by the active Pi auth provider. */
  openExternal: (url: string) => void | Promise<void>;
}

export interface WorkspaceRuntimeOptions {
  /** Canonical workspace id, owned by the host's workspace catalog. */
  workspaceId: WorkspaceId;
  /** Stable paths for state, the agent cwd, and the manifest. */
  workspace: Workspace;
  /** Host-owned Pi profile shared across workspaces. */
  piProfileDir: string;
  /** On-disk dir of the `@uix/api` implementation feature imports resolve to. */
  apiModuleDir?: string;
  dependencies: WorkspaceRuntimeDependencies;
}

const PrimaryAgentInstanceId = toAgentInstanceId("primary");

/**
 * The runtime-internal surface an attachment closes over. Not part of the
 * WorkspaceRuntime contract: the host never sees these.
 */
interface RuntimeAttachmentHost {
  readonly workspaceId: WorkspaceId;
  dispatch(
    context: AttachmentContext,
    request: CanonicalRequest,
  ): Promise<CanonicalResponse>;
  retargetTo(target: SessionTarget): Promise<void>;
  dropAttachment(attachment: WorkspaceRuntimeAttachment): void;
}

/**
 * The exactly-one-workspace runtime. Owns the accepted feature composition,
 * settings, stores, registries, the selected-session agent driver, and the
 * reload coordinator under one lifetime bag. Disposing it removes only this
 * workspace's state and routes.
 */
class WorkspaceRuntime
  implements WorkspaceRuntimeContract, RuntimeAttachmentHost
{
  readonly #workspaceId: WorkspaceId;
  readonly #bag = new DisposableBag();
  readonly #featuresBag = new DisposableBag();
  readonly #channels: ChannelRegistry;
  readonly #resources: ResourceRegistry;
  readonly #settingsRegistry: SettingsRegistry;
  readonly #surfaces = new SurfaceRegistry();
  readonly #surfacePipeline: SurfaceModulePipeline;
  readonly #driver: ReturnType<typeof createAgentDriver>;
  readonly #uixPublisher: FeatureEventPublisher<typeof substrateChannels>;
  readonly #substrate: FeatureSubstrate;
  readonly #reloadCoordinator: {
    reload(): Promise<{
      featureActivation: ActivationResult;
      piResourcesReloaded: boolean;
      turnStateCommitted: boolean;
    }>;
  };
  readonly #attachments = new Set<WorkspaceRuntimeAttachment>();
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  readonly #workspace: Workspace;
  #nextAttachment = 0;
  #nextEventId = 0;
  #disposed = false;

  constructor(opts: WorkspaceRuntimeOptions) {
    this.#workspaceId = opts.workspaceId;
    this.#workspace = opts.workspace;
    const { workspace, piProfileDir, dependencies } = opts;

    const documents = createLocalDocumentStoreFactory(workspace.stateRoot);
    const workspaceManifest = this.#bag.add(
      new WorkspaceManifestStore(workspace.manifestPath),
    );
    this.#settingsRegistry = this.#bag.add(new SettingsRegistry());
    const workspaceSettings = createWorkspaceSettings(
      workspaceManifest,
      this.#settingsRegistry,
      [
        agentWorkspaceSettings,
        sessionWorkspaceSettings,
        keybindingsWorkspaceSettings,
      ],
    );

    this.#resources = this.#bag.add(
      new ResourceRegistry({
        workspaceId: this.#workspaceId,
        transportRegistrar: dependencies.resourceTransport,
      }),
    );
    this.#channels = new ChannelRegistry(dependencies.channelTransport);
    const turnState = new TurnStateRegistry();
    const agentTools = new AgentToolRegistry();
    const agentSystemPrompt = new AgentSystemPromptRegistry();
    const agentSkills = new AgentSkillRegistry();
    const agentContext = new AgentContextRegistry();

    // Agent publisher: created early so the driver can emit events through
    // the channel transport.
    const agentPublisher = createFeatureEventPublisherFactory(
      "agent",
      this.#channels,
    ).createPublisher(agentChannels);

    this.#driver = this.#bag.add(
      createAgentDriver({
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
        sessionSettings: workspaceSettings.forNamespace(
          sessionWorkspaceSettings,
        ),
        onStatusChange: (status) => {
          agentPublisher.status_changed(status);
        },
        openExternal: dependencies.openExternal,
        onProviderAuthFlowSnapshot: (snapshot) => {
          agentPublisher.provider_auth_flow_changed(snapshot);
        },
        onModelAvailabilityChange: () => {
          agentPublisher.model_availability_changed();
        },
      }),
    );

    // Substrate workspace channels under the reserved `uix` id: the surface
    // composition the renderer mounts, plus the changed signal fired after
    // every load pass so the page re-fetches. The pipeline bundles each
    // registered surface entry into a servable module. Its routes live on the
    // substrate origin.
    this.#surfacePipeline = new SurfaceModulePipeline(this.#workspaceId);
    this.#bag.add(
      registerResourceContributions(
        this.#resources,
        "uix",
        this.#surfacePipeline.createResourceContributions(),
      ),
    );
    this.#uixPublisher = createFeatureEventPublisherFactory(
      "uix",
      this.#channels,
    ).createPublisher(substrateChannels);
    const keybindingSettings = workspaceSettings.forNamespace(
      keybindingsWorkspaceSettings,
    );
    const keybindingRequestHandlers = createKeybindingRequestHandlers({
      getBindingsSnapshot: () => keybindingSettings.getSnapshot(),
      replaceBindings: (candidate) => keybindingSettings.replace(candidate),
      publishBindingsChanged: (bindings) => {
        this.#uixPublisher.keybindings_changed(bindings);
      },
    });
    this.#bag.add(
      disposable(
        this.#settingsRegistry.onAnyChange((scopeId, key, value) => {
          this.#uixPublisher.setting_changed({
            featureId: scopeId,
            key,
            value,
          });
        }),
      ),
    );

    this.#bag.add(
      registerChannelContributions(this.#channels, "uix", [
        withHandlers(substrateChannels, {
          surfaces: {
            handler: async () => ({
              surfaces: await this.#surfacePipeline.buildAll(
                this.#surfaces.list(),
              ),
              manifestPath: workspace.manifestPath,
              manifestFound: fs.existsSync(workspace.manifestPath),
            }),
          },
          get_setting: {
            handler: (req) =>
              this.#settingsRegistry.get(req.featureId, req.key),
          },
          set_setting: {
            handler: (req) => {
              this.#settingsRegistry.set(req.featureId, req.key, req.value);
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
    this.#bag.add(
      registerChannelContributions(this.#channels, "agent", [
        withHandlers(agentChannels, {
          prompt: {
            handler: (req) => {
              // Fire and forget. The renderer subscribes to the event
              // stream, and the invoke resolves once the prompt has been
              // accepted.
              void this.#driver.prompt(req.text);
            },
          },
          session_history: {
            handler: ({ sessionId }) => this.#driver.sessionHistory(sessionId),
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
            handler: ({ limit }) => this.#driver.listSessionSummaries(limit),
            log: {
              describeResponse: (sessions) => ({
                sessionIds: sessions.map((session) => session.sessionId),
              }),
            },
          },
          new_session: {
            handler: () => this.#driver.newSession(),
          },
          switch_session: {
            handler: ({ sessionId }) => this.#driver.switchSession(sessionId),
          },
          set_session_title: {
            handler: ({ sessionId, title }) =>
              this.#driver.setSessionTitle(sessionId, title),
          },
          list_models: {
            handler: async () => ({ models: await this.#driver.listModels() }),
          },
          set_model_favorite: {
            handler: async (update) => ({
              models: await this.#driver.setModelFavorite(update),
            }),
          },
          agent_status: {
            handler: () => this.#driver.getStatus(),
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
            handler: (ref) => this.#driver.selectModel(ref),
          },
          list_auth_providers: {
            handler: async () => ({
              providers: await this.#driver.listAuthProviders(),
            }),
          },
          current_provider_auth_flow: {
            handler: () => this.#driver.getCurrentProviderAuthFlow() ?? null,
          },
          begin_provider_auth_flow: {
            handler: ({ providerId, authType }) =>
              this.#driver.beginProviderAuthFlow(providerId, authType),
          },
          answer_provider_auth_flow: {
            handler: ({ flowId, promptId, value }) => {
              this.#driver.answerProviderAuthFlow(flowId, promptId, value);
            },
          },
          open_provider_auth_link: {
            handler: ({ flowId, linkId }) =>
              this.#driver.openProviderAuthLink(flowId, linkId),
          },
          cancel_provider_auth_flow: {
            handler: ({ flowId }) => {
              this.#driver.cancelProviderAuthFlow(flowId);
            },
          },
        }),
      ]),
    );

    const apiModuleDir = opts.apiModuleDir;
    this.#substrate = {
      documents,
      settings: workspaceSettings,
      channels: this.#channels,
      ...(apiModuleDir !== undefined &&
        fs.existsSync(apiModuleDir) && { apiModuleDir }),
      registries: {
        resources: this.#resources,
        channels: this.#channels,
        agentTools,
        agentSystemPrompt,
        agentSkills,
        turnState,
        agentContext,
        surfaces: this.#surfaces,
      },
    };

    this.#reloadCoordinator = createWorkspaceReloadCoordinator({
      commitTurnState: () => this.#driver.commitFeatureTurnState(),
      loadFeatures: () =>
        loadFeatures(
          this.#currentSources(),
          this.#featuresBag,
          this.#substrate,
        ),
      reloadPiResources: () => this.#driver.reloadPiResources(),
      restoreTurnState: () => this.#driver.restoreFeatureTurnState(),
      publishSurfacesChanged: () => {
        this.#uixPublisher.surfaces_changed({});
      },
    });
  }

  get workspaceId(): WorkspaceId {
    return this.#workspaceId;
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    this.#listeners.add(listener);
    return disposable(() => {
      this.#listeners.delete(listener);
    });
  }

  /**
   * Activate the initial feature composition. The host calls this once after
   * construction and records the result (e.g. recents). A bad manifest must
   * not brick the runtime: it logs loudly and boots with no features. Reload
   * keeps strict semantics (a bad manifest rejects, tree intact).
   */
  async load(): Promise<ActivationResult> {
    let activation: ActivationResult;
    try {
      activation = await loadFeatures(
        this.#currentSources(),
        this.#featuresBag,
        this.#substrate,
      );
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error(String(thrown));
      createLogger("features").error({ err: error.message }, "manifest_failed");
      activation = { activated: [], failed: [] };
    }
    createLogger("features").debug(
      {
        activated: activation.activated.length,
        failed: activation.failed.length,
      },
      "activation_complete",
    );
    this.#uixPublisher.surfaces_changed({});
    // Restoration must start after initial feature activation: the accepted
    // turn-state cell registry determines which selected-branch state is
    // retained and restored. The auth-bearing live agent stays lazy until the
    // first prompt.
    this.#driver.init();
    this.#emit(
      { kind: "workspace" },
      "composition_loaded",
      this.#activationPayload(activation),
    );
    return activation;
  }

  /**
   * Replace the active feature composition and Pi resource tier: commit turn
   * state, re-activate features, reload Pi resources, restore turn state, then
   * publish surfaces_changed for the renderer. Serialized by the coordinator.
   */
  async reload(): Promise<ReloadResult> {
    const reloadLog = createLogger("workspace");
    reloadLog.debug({}, "reload_started");
    try {
      const { featureActivation, piResourcesReloaded, turnStateCommitted } =
        await this.#reloadCoordinator.reload();
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
      this.#emit(
        { kind: "workspace" },
        "composition_reloaded",
        this.#activationPayload(featureActivation),
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
  }

  async createAttachment(target: SessionTarget): Promise<RuntimeAttachment> {
    if (this.#disposed)
      return Promise.reject(new Error("Workspace runtime is disposed"));
    assertSupportedSessionTarget(target);
    this.#nextAttachment += 1;
    const attachment = new WorkspaceRuntimeAttachment(
      this,
      toAttachmentId(`attachment-${String(this.#nextAttachment)}`),
      target.sessionId,
    );
    this.#attachments.add(attachment);
    return Promise.resolve(attachment);
  }

  // Runtime-internal attachment host surface (not part of WorkspaceRuntime).

  /** Dispatch one canonical request through this workspace's channel table. */
  async dispatch(
    context: AttachmentContext,
    request: CanonicalRequest,
  ): Promise<CanonicalResponse> {
    if (this.#disposed) {
      return {
        ok: false,
        error: { code: "disposed", message: "Workspace runtime is disposed" },
      };
    }
    return this.#channels.dispatch(context, request);
  }

  /** Current singleton semantics: retarget switches the workspace's selected session. */
  async retargetTo(target: SessionTarget): Promise<void> {
    assertSupportedSessionTarget(target);
    await this.#driver.switchSession(target.sessionId);
  }

  /** Release one attachment's binding. Idempotent. */
  dropAttachment(attachment: WorkspaceRuntimeAttachment): void {
    this.#attachments.delete(attachment);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const attachment of [...this.#attachments]) {
      await attachment.dispose();
    }
    this.#attachments.clear();
    this.#listeners.clear();
    this.#featuresBag[Symbol.dispose]();
    this.#bag[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    void this.dispose();
  }

  #currentSources(): FeatureSources {
    return {
      ...(fs.existsSync(this.#workspace.manifestPath) && {
        manifestPath: this.#workspace.manifestPath,
      }),
    };
  }

  #activationPayload(activation: ActivationResult): {
    activated: number;
    failed: number;
  } {
    return {
      activated: activation.activated.length,
      failed: activation.failed.length,
    };
  }

  /** Runtime-internal: emit one scoped runtime event to host listeners. */
  #emit(scope: EventScope, id: string, payload: unknown): void {
    const event: RuntimeEvent = {
      id: `${id}-${String(this.#nextEventId)}`,
      scope,
      payload,
    };
    this.#nextEventId += 1;
    for (const listener of this.#listeners) listener(event);
  }
}

/**
 * The runtime-owned half of an attachment: a binding to the workspace's
 * selected session through the primary agent instance. The runtime keeps
 * the selected-session singleton semantics the driver already provides.
 */
class WorkspaceRuntimeAttachment implements RuntimeAttachment {
  readonly #host: RuntimeAttachmentHost;
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  sessionId: SessionId;
  readonly instanceId = PrimaryAgentInstanceId;
  #disposed = false;

  constructor(
    host: RuntimeAttachmentHost,
    attachmentId: AttachmentId,
    sessionId: SessionId,
  ) {
    this.#host = host;
    this.attachmentId = attachmentId;
    this.workspaceId = host.workspaceId;
    this.sessionId = sessionId;
  }

  dispatch(
    context: AttachmentContext,
    request: CanonicalRequest,
  ): Promise<CanonicalResponse> {
    if (this.#disposed) {
      return Promise.resolve({
        ok: false,
        error: { code: "disposed", message: "Attachment is disposed" },
      });
    }
    return this.#host.dispatch(
      { ...context, workspaceId: this.workspaceId, sessionId: this.sessionId },
      request,
    );
  }

  async retarget(target: SessionTarget): Promise<void> {
    if (this.#disposed) throw new Error("Attachment is disposed");
    // The current singleton switches the selected session. A failure (e.g. the
    // agent is streaming) leaves the target unchanged.
    const before = this.sessionId;
    try {
      await this.#host.retargetTo(target);
    } catch (err) {
      this.sessionId = before;
      throw err;
    }
    this.sessionId = target.sessionId;
  }

  dispose(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#disposed = true;
    this.#host.dropAttachment(this);
    return Promise.resolve();
  }
}

function assertSupportedSessionTarget(target: SessionTarget): void {
  if (target.branchId) {
    throw new Error("Branch session targets are not supported");
  }
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

/** Create one workspace runtime over host-provided ports. */
export function createWorkspaceRuntime(
  opts: WorkspaceRuntimeOptions,
): WorkspaceRuntimeContract {
  return new WorkspaceRuntime(opts);
}
