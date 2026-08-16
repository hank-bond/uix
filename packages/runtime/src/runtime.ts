// Composes the workspace substrate into one exactly-one-workspace runtime over host-provided dependencies.
//
// The host supplies resource delivery, external-link opening, and stable
// workspace dependencies. Canonical requests enter through runtime-created
// attachments, while scoped events leave through runtime listeners.

import fs from "node:fs";
import { join } from "node:path";

import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";

import { agentChannels, type AgentEvent } from "@uix/api/agent-channels";
import {
  type ChannelCanonicalId,
  toChannelCanonicalId,
} from "@uix/api/channel-resolution";
import {
  type ChannelEventLogOptions,
  type FeatureEventPublisher,
  withHandlers,
} from "@uix/api/channels";
import type { ReloadResult } from "@uix/api/substrate-channels";
import { substrateChannels } from "@uix/api/substrate-channels";

import type { AgentInstanceGuard } from "./agent/instance-supervisor";
import {
  type OpenedPrimarySession,
  openWorkspaceFallbackSession,
} from "./agent/session-manager";
import { agentWorkspaceSettings } from "./agent/settings";
import { createWorkspaceAgentRuntime } from "./agent/workspace-agent-runtime";
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
import type {
  AttachmentDispatchContext,
  CanonicalRequest,
  PreparedDispatch,
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
  Attachment as AttachmentContract,
  AttachmentId,
  CreatedAttachment,
  SessionTarget,
  WorkspaceId,
  WorkspaceRuntime as WorkspaceRuntimeContract,
} from "./workspace";
import { toAttachmentId, toSessionId } from "./workspace";
import { createWorkspaceSettings } from "./workspace-settings";

/** The dependencies a host provides. The runtime declares them, never imports them. */
export interface WorkspaceRuntimeDependencies {
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
  /** Host-owned Pi app data directory shared across workspaces. */
  piAppDataDir: string;
  /** On-disk dir of the `@uix/api` implementation feature imports resolve to. */
  apiModuleDir?: string;
  dependencies: WorkspaceRuntimeDependencies;
}

/**
 * The runtime-internal surface an attachment closes over. Not part of the
 * WorkspaceRuntime contract: the host never sees these.
 */
interface AttachmentOwner {
  readonly workspaceId: WorkspaceId;
  acquireAgentInstanceGuard(
    target: SessionTarget,
    openedManager?: SessionManager,
    origin?: string,
  ): Promise<AgentInstanceGuard>;
  prepareDispatch(
    context: AttachmentDispatchContext,
    request: CanonicalRequest,
    disposeOperationGuard: () => void,
  ): PreparedDispatch;
  dropAttachment(attachment: Attachment): void;
}

/**
 * The exactly-one-workspace runtime. Owns the accepted feature composition,
 * settings, stores, registries, workspace agent runtime, and reload
 * coordinator under one lifetime bag. Disposing it removes only this
 * workspace's state and routes.
 */
class WorkspaceRuntime implements WorkspaceRuntimeContract, AttachmentOwner {
  readonly #workspaceId: WorkspaceId;
  readonly #bag = new DisposableBag();
  readonly #featuresBag = new DisposableBag();
  readonly #channels: ChannelRegistry;
  readonly #resources: ResourceRegistry;
  readonly #settingsRegistry: SettingsRegistry;
  readonly #surfaces = new SurfaceRegistry();
  readonly #surfacePipeline: SurfaceModulePipeline;
  readonly #agentRuntime: ReturnType<typeof createWorkspaceAgentRuntime>;
  readonly #openFallbackSession: () => Promise<OpenedPrimarySession>;
  readonly #uixPublisher: FeatureEventPublisher<typeof substrateChannels>;
  readonly #substrate: FeatureSubstrate;
  readonly #reloadCoordinator: {
    reload(): Promise<{
      featureActivation: ActivationResult;
      piResourcesReloaded: boolean;
      turnStateCommitted: boolean;
    }>;
  };
  readonly #attachments = new Set<Attachment>();
  readonly #listeners = new Set<(event: RuntimeEvent) => void>();
  readonly #workspace: Workspace;
  #nextAttachment = 0;
  #nextEventId = 0;
  #disposal: Promise<void> | undefined;
  #disposed = false;

  constructor(opts: WorkspaceRuntimeOptions) {
    this.#workspaceId = opts.workspaceId;
    this.#workspace = opts.workspace;
    const { workspace, piAppDataDir, dependencies } = opts;

    const documents = createLocalDocumentStoreFactory(workspace.stateRoot);
    const workspaceManifest = this.#bag.add(
      new WorkspaceManifestStore(workspace.manifestPath),
    );
    this.#settingsRegistry = this.#bag.add(new SettingsRegistry());
    const workspaceSettings = createWorkspaceSettings(
      workspaceManifest,
      this.#settingsRegistry,
      [agentWorkspaceSettings, keybindingsWorkspaceSettings],
    );

    this.#resources = this.#bag.add(
      new ResourceRegistry({
        workspaceId: this.#workspaceId,
        transportRegistrar: dependencies.resourceTransport,
      }),
    );
    this.#channels = new ChannelRegistry({
      publish: (channel, payload, logOptions) => {
        this.#emit({ kind: "workspace" }, channel, payload, logOptions);
      },
    });
    const turnState = new TurnStateRegistry();
    const agentTools = new AgentToolRegistry();
    const agentSystemPrompt = new AgentSystemPromptRegistry();
    const agentSkills = new AgentSkillRegistry();
    const agentContext = new AgentContextRegistry();

    const createAgentEventPublisher = (
      scope: EventScope,
    ): FeatureEventPublisher<typeof agentChannels> =>
      createFeatureEventPublisherFactory("agent", {
        publish: (channel, payload, logOptions) => {
          this.#emit(scope, channel, payload, logOptions);
        },
      }).createPublisher(agentChannels);
    const workspaceAgentPublisher = createAgentEventPublisher({
      kind: "workspace",
    });

    let inFlightFallback: Promise<OpenedPrimarySession> | undefined;
    this.#openFallbackSession = () => {
      if (inFlightFallback) return inFlightFallback;
      const opening = openWorkspaceFallbackSession({
        cwd: workspace.agentCwd,
        sessionDir: join(workspace.stateRoot, ".uix", "sessions"),
      }).finally(() => {
        if (inFlightFallback === opening) inFlightFallback = undefined;
      });
      inFlightFallback = opening;
      return opening;
    };

    this.#agentRuntime = createWorkspaceAgentRuntime({
      onEvent: (sessionId, event) => {
        logChatContent(event);
        createAgentEventPublisher({ kind: "session", sessionId }).event(event);
      },
      workspace,
      piAppDataDir,
      turnState,
      agentSystemPrompt,
      agentSkills,
      agentContext,
      agentInstallers: [createAgentToolInstaller(agentTools)],
      // Lazy handles: workspace scopes register during the settings reload
      // inside loadFeatures(), before any agent operation can read them.
      agentSettings: workspaceSettings.forNamespace(agentWorkspaceSettings),
      onStatusChange: (sessionId, status) => {
        createAgentEventPublisher({
          kind: "session",
          sessionId,
        }).status_changed(status);
      },
      openExternal: dependencies.openExternal,
      onProviderAuthFlowSnapshot: (snapshot) => {
        workspaceAgentPublisher.provider_auth_flow_changed(snapshot);
      },
      onModelAvailabilityChange: () => {
        workspaceAgentPublisher.model_availability_changed();
      },
    });

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

    const registerAgentRequest = <
      K extends keyof typeof agentChannels.requests,
    >(
      name: K,
      handler: (
        context: AttachmentDispatchContext,
        request: Static<(typeof agentChannels.requests)[K]["requestSchema"]>,
      ) =>
        | Static<(typeof agentChannels.requests)[K]["responseSchema"]>
        | Promise<Static<(typeof agentChannels.requests)[K]["responseSchema"]>>,
    ): globalThis.Disposable => {
      const contract = agentChannels.requests[name];
      return this.#channels.register({
        canonicalId: toChannelCanonicalId("agent", name),
        requestSchema: contract.requestSchema,
        responseSchema: contract.responseSchema,
        handler: (
          request: Static<(typeof agentChannels.requests)[K]["requestSchema"]>,
          context: AttachmentDispatchContext,
        ) => handler(context, request),
        ...("log" in contract ? { log: contract.log } : {}),
      });
    };

    const agentChannelsBag = this.#bag.add(new DisposableBag());
    agentChannelsBag.add(
      registerAgentRequest("prompt", (context, request) => {
        void this.#agentRuntime.prompt(
          context.agentInstanceGuard,
          request.text,
        );
      }),
    );
    agentChannelsBag.add(
      registerAgentRequest("session_history", (context) =>
        this.#agentRuntime.readSessionHistory(context.agentInstanceGuard),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("list_session_summaries", (_context, { limit }) =>
        this.#agentRuntime.listSessionSummaries(limit),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("new_session", async (context) => {
        const opened = await this.#agentRuntime.createSession();
        using guard = await context.retarget(opened.target, opened.manager);
        return (await this.#agentRuntime.readSessionHistory(guard)).session;
      }),
    );
    agentChannelsBag.add(
      registerAgentRequest("switch_session", async (context, { sessionId }) => {
        using guard = await context.retarget({
          sessionId: toSessionId(sessionId),
        });
        return (await this.#agentRuntime.readSessionHistory(guard)).session;
      }),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "set_session_title",
        (context, { sessionId, title }) =>
          this.#agentRuntime.setSessionTitle(
            context.agentInstanceGuard,
            sessionId,
            title,
          ),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("list_models", async () => ({
        models: await this.#agentRuntime.listModels(),
      })),
    );
    agentChannelsBag.add(
      registerAgentRequest("set_model_favorite", async (_context, update) => ({
        models: await this.#agentRuntime.setModelFavorite(update),
      })),
    );
    agentChannelsBag.add(
      registerAgentRequest("agent_status", (context) =>
        this.#agentRuntime.getStatus(context.agentInstanceGuard),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("tool_catalog", () => ({
        tools: agentTools.list().map(({ tool }) => ({
          name: tool.name,
          label: tool.label,
        })),
      })),
    );
    agentChannelsBag.add(
      registerAgentRequest("select_model", (context, ref) =>
        this.#agentRuntime.selectModel(context.agentInstanceGuard, ref),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("list_auth_providers", async () => ({
        providers: await this.#agentRuntime.listAuthProviders(),
      })),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "current_provider_auth_flow",
        () => this.#agentRuntime.getCurrentProviderAuthFlow() ?? null,
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "begin_provider_auth_flow",
        (_context, { providerId, authType }) =>
          this.#agentRuntime.beginProviderAuthFlow(providerId, authType),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "answer_provider_auth_flow",
        (_context, { flowId, promptId, value }) => {
          this.#agentRuntime.answerProviderAuthFlow(flowId, promptId, value);
        },
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "open_provider_auth_link",
        (_context, { flowId, linkId }) =>
          this.#agentRuntime.openProviderAuthLink(flowId, linkId),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest(
        "cancel_provider_auth_flow",
        (_context, { flowId }) => {
          this.#agentRuntime.cancelProviderAuthFlow(flowId);
        },
      ),
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
      commitTurnState: () => this.#agentRuntime.commitFeatureTurnState(),
      loadFeatures: () =>
        loadFeatures(
          this.#currentSources(),
          this.#featuresBag,
          this.#substrate,
        ),
      reloadPiResources: () => this.#agentRuntime.reloadPiResources(),
      restoreTurnState: () => this.#agentRuntime.restoreFeatureTurnState(),
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
    this.#emit(
      { kind: "workspace" },
      toChannelCanonicalId("uix", "composition_loaded"),
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
        toChannelCanonicalId("uix", "composition_reloaded"),
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

  async createAttachment(target?: SessionTarget): Promise<CreatedAttachment> {
    if (this.#disposed) throw new Error("Workspace runtime is disposed");
    const openedFallback = target
      ? undefined
      : await this.#openFallbackSession();
    const acceptedTarget = target ?? openedFallback?.target;
    if (!acceptedTarget) throw new Error("Session target resolution failed");
    assertSupportedSessionTarget(acceptedTarget);
    const guard = await this.#agentRuntime.acquire(
      acceptedTarget,
      openedFallback?.manager,
      "attachment",
    );
    if (this.#disposal) {
      guard[Symbol.dispose]();
      throw new Error("Workspace runtime is disposed");
    }
    this.#nextAttachment += 1;
    const attachment = new Attachment(
      this,
      toAttachmentId(`attachment-${String(this.#nextAttachment)}`),
      guard,
    );
    this.#attachments.add(attachment);
    return {
      attachment,
      deliver: (event) => {
        attachment.deliver(event);
      },
    };
  }

  // Attachment-owner surface, internal to this runtime.

  acquireAgentInstanceGuard(
    target: SessionTarget,
    openedManager?: SessionManager,
    origin = "attachment",
  ): Promise<AgentInstanceGuard> {
    assertSupportedSessionTarget(target);
    return this.#agentRuntime.acquire(target, openedManager, origin);
  }

  prepareDispatch(
    context: AttachmentDispatchContext,
    request: CanonicalRequest,
    disposeOperationGuard: () => void,
  ): PreparedDispatch {
    if (this.#disposed) {
      disposeOperationGuard();
      throw new Error("Workspace runtime is disposed");
    }
    return this.#channels.prepare(context, request, disposeOperationGuard);
  }

  dropAttachment(attachment: Attachment): void {
    this.#attachments.delete(attachment);
  }

  [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#disposed = true;
    this.#disposal = (async () => {
      for (const attachment of [...this.#attachments]) {
        attachment[Symbol.dispose]();
      }
      this.#attachments.clear();
      this.#listeners.clear();
      try {
        await this.#agentRuntime[Symbol.asyncDispose]();
      } finally {
        this.#featuresBag[Symbol.dispose]();
        this.#bag[Symbol.dispose]();
      }
    })();
    return this.#disposal;
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

  /** Runtime-internal: emit one scoped canonical event to host listeners. */
  #emit(
    scope: EventScope,
    channel: ChannelCanonicalId,
    payload: unknown,
    logOptions?: ChannelEventLogOptions<unknown>,
  ): void {
    const event: RuntimeEvent = {
      id: `event-${String(this.#nextEventId)}`,
      channel,
      scope,
      payload,
      ...(logOptions && { logOptions }),
    };
    this.#nextEventId += 1;
    for (const listener of this.#listeners) listener(event);
  }
}

/** One runtime-created attachment object. */
class Attachment implements AttachmentContract {
  readonly #owner: AttachmentOwner;
  readonly #eventListeners = new Set<(event: RuntimeEvent) => void>();
  readonly #closeListeners = new Set<() => void>();
  readonly attachmentId: AttachmentId;
  readonly workspaceId: WorkspaceId;
  #target: SessionTarget;
  #targetGuard: AgentInstanceGuard;
  #disposed = false;

  constructor(
    owner: AttachmentOwner,
    attachmentId: AttachmentId,
    targetGuard: AgentInstanceGuard,
  ) {
    this.#owner = owner;
    this.attachmentId = attachmentId;
    this.workspaceId = owner.workspaceId;
    this.#target = targetGuard.value.target;
    this.#targetGuard = targetGuard;
  }

  get target(): SessionTarget {
    return this.#target;
  }

  prepareDispatch(request: CanonicalRequest): PreparedDispatch {
    if (this.#disposed) throw new Error("Attachment is disposed");
    const operationGuard = this.#targetGuard.retain("dispatch");
    const acceptedTarget = operationGuard.value.target;
    return this.#owner.prepareDispatch(
      {
        workspaceId: this.workspaceId,
        attachmentId: this.attachmentId,
        target: acceptedTarget,
        agentInstanceGuard: operationGuard,
        retarget: (target, openedManager) =>
          this.#retargetAndGuard(target, openedManager, true),
      },
      request,
      () => {
        operationGuard[Symbol.dispose]();
      },
    );
  }

  async retarget(target: SessionTarget): Promise<void> {
    using _retargetGuard = await this.#retargetAndGuard(
      target,
      undefined,
      false,
    );
  }

  onEvent(listener: (event: RuntimeEvent) => void): Disposable {
    if (this.#disposed) throw new Error("Attachment is disposed");
    this.#eventListeners.add(listener);
    return disposable(() => this.#eventListeners.delete(listener));
  }

  onClose(listener: () => void): Disposable {
    if (this.#disposed) {
      listener();
      return disposable(() => undefined);
    }
    this.#closeListeners.add(listener);
    return disposable(() => this.#closeListeners.delete(listener));
  }

  deliver(event: RuntimeEvent): void {
    if (this.#disposed) return;
    for (const listener of this.#eventListeners) listener(event);
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#owner.dropAttachment(this);
    this.#targetGuard[Symbol.dispose]();
    this.#eventListeners.clear();
    for (const listener of this.#closeListeners) listener();
    this.#closeListeners.clear();
  }

  async #retargetAndGuard(
    target: SessionTarget,
    openedManager: SessionManager | undefined,
    allowClosed: boolean,
  ): Promise<AgentInstanceGuard> {
    if (this.#disposed && !allowClosed) {
      throw new Error("Attachment is disposed");
    }
    const next = await this.#owner.acquireAgentInstanceGuard(
      target,
      openedManager,
      "attachment",
    );
    if (this.#disposed) {
      if (allowClosed) return next;
      next[Symbol.dispose]();
      throw new Error("Attachment is disposed");
    }
    const previous = this.#targetGuard;
    this.#target = next.value.target;
    this.#targetGuard = next;
    previous[Symbol.dispose]();
    return next.retain("retarget-response");
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

/** Create one workspace runtime over host-provided dependencies. */
export function createWorkspaceRuntime(
  opts: WorkspaceRuntimeOptions,
): WorkspaceRuntimeContract {
  return new WorkspaceRuntime(opts);
}
