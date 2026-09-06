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
import { Attachment, type AttachmentOwner } from "./attachment";
import {
  type AttachmentWebBindingHandle,
  AttachmentWebBindingRegistry,
} from "./attachment-web-bindings";
import {
  ChannelRegistry,
  createFeatureEventPublisherFactory,
  registerChannelContributions,
} from "./channel-registry";
import type { ContentTransportRegistrar } from "./content-transport";
import type {
  AttachmentDispatchContext,
  CanonicalRequest,
  PreparedDispatch,
} from "./dispatch";
import { createLocalDocumentStoreFactory } from "./document-store";
import type { EventScope, RuntimeEvent } from "./events";
import type {
  ActivatedAgentFeature,
  ActivationResult,
  FeatureSources,
  FeatureSubstrate,
} from "./features/loader";
import { loadFeatures } from "./features/loader";
import { SurfaceModulePipeline } from "./features/surface-pipeline";
import { SurfaceRegistry } from "./features/surfaces";
import { createKeybindingRequestHandlers } from "./keybindings/requests";
import { keybindingsWorkspaceSettings } from "./keybindings/settings";
import { AsyncDisposableBag, disposable, DisposableBag } from "./lifecycle";
import { createLogger } from "./log";
import { WorkspaceManifestStore } from "./manifest-store";
import { OperationTracker } from "./operation-tracker";
import { createWorkspaceReloadCoordinator } from "./reload";
import {
  registerResourceContributions,
  ResourceRegistry,
} from "./resource-registry";
import { SettingsRegistry } from "./settings-registry";
import { WebRouteContractRegistry } from "./web-route-registry";
import { toWebRouteResponse } from "./web-route-response";
import type {
  AttachmentAdmission,
  CreatedAttachment,
  SessionTarget,
  ViewpointWebRequest,
  ViewpointWebResponse,
  WorkspaceId,
  WorkspaceRuntime as WorkspaceRuntimeContract,
} from "./workspace";
import { toAttachmentId, toSessionId } from "./workspace";
import type { Workspace } from "./workspace-roots";
import { createWorkspaceSettings } from "./workspace-settings";

const webRouteLog = createLogger("web-routes");

/** The dependencies a host provides. The runtime declares them, never imports them. */
export interface WorkspaceRuntimeDependencies {
  /**
   * Shared workspace resource and viewpoint web delivery. Omitted when the
   * host does not serve browser content. Registries still own their routes.
   */
  contentTransportRegistrar?: ContentTransportRegistrar;
  /**
   * Optionally launch retained Pi provider-auth links.
   * The host owns failure logging and must not throw.
   */
  launchProviderAuthLink?: (url: string) => void;
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
 * The exactly-one-workspace runtime. Owns the accepted feature composition,
 * settings, stores, registries, workspace agent runtime, and reload
 * coordinator under one lifetime bag. Disposing it removes only this
 * workspace's state and routes.
 */
class WorkspaceRuntime implements WorkspaceRuntimeContract, AttachmentOwner {
  readonly #workspaceId: WorkspaceId;
  readonly #bag = new DisposableBag();
  readonly #featuresBag = new AsyncDisposableBag();
  readonly #channels: ChannelRegistry;
  readonly #resources: ResourceRegistry;
  readonly #attachmentWebBindings = new AttachmentWebBindingRegistry();
  readonly #viewpointWebRoutes = new WebRouteContractRegistry();
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
  readonly #dispatchOperations = new OperationTracker();
  readonly #lifetime = new AsyncDisposableBag();
  readonly #workspace: Workspace;
  #agentFeatures: readonly ActivatedAgentFeature[] = [];
  #nextAttachment = 0;
  #nextEventId = 0;
  #disposal: Promise<void> | undefined;
  #disposed = false;

  constructor(opts: WorkspaceRuntimeOptions) {
    this.#workspaceId = opts.workspaceId;
    this.#workspace = opts.workspace;
    const { workspace, piAppDataDir, dependencies } = opts;
    this.#lifetime.add(this.#bag);
    this.#lifetime.add(this.#featuresBag);
    this.#bag.add(this.#attachmentWebBindings);

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
      }),
    );
    if (dependencies.contentTransportRegistrar) {
      this.#bag.add(
        dependencies.contentTransportRegistrar(async (content) => {
          switch (content.kind) {
            case "resource":
              return this.#resources.dispatch(content.request);
            case "viewpoint":
              return toWebRouteResponse(
                await this.dispatchViewpointWebRequest(content.request),
              );
          }
        }),
      );
    }
    this.#channels = new ChannelRegistry({
      publish: (channel, payload, logOptions) => {
        this.#emit({ kind: "workspace" }, channel, payload, logOptions);
      },
    });
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
      documents,
      onEvent: (sessionId, event) => {
        logChatContent(event);
        createAgentEventPublisher({ kind: "session", sessionId }).event(event);
      },
      onFeatureEvent: (sessionId, channel, payload, logOptions) => {
        this.#emit(
          { kind: "session", sessionId },
          channel,
          payload,
          logOptions,
        );
      },
      workspace,
      piAppDataDir,
      getAgentFeatures: () => this.#agentFeatures,
      // Lazy handles: workspace scopes register during the settings reload
      // inside loadFeatures(), before any agent operation can read them.
      agentSettings: workspaceSettings.forNamespace(agentWorkspaceSettings),
      onStatusChange: (sessionId, status) => {
        createAgentEventPublisher({
          kind: "session",
          sessionId,
        }).status_changed(status);
      },
      ...(dependencies.launchProviderAuthLink && {
        launchProviderAuthLink: dependencies.launchProviderAuthLink,
      }),
      onProviderAuthFlowSnapshot: (snapshot) => {
        workspaceAgentPublisher.provider_auth_flow_changed(snapshot);
      },
      onModelAvailabilityChange: () => {
        workspaceAgentPublisher.model_availability_changed();
      },
    });
    this.#lifetime.add(this.#agentRuntime);
    this.#lifetime.add(this.#dispatchOperations);

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
          reload: {
            handler: () => this.#reload(),
          },
          surfaces: {
            handler: async () => ({
              surfaces: await this.#surfacePipeline.buildAll(
                this.#surfaces.list(),
              ),
              channelNamespaces: [...this.#channels.listNamespaces()],
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
    agentChannelsBag.add(this.#channels.registerNamespace("agent"));
    agentChannelsBag.add(
      registerAgentRequest("prompt", (context, request) =>
        this.#agentRuntime.commitPrompt(context.agentInstanceGuard, request),
      ),
    );
    agentChannelsBag.add(
      registerAgentRequest("cancel_turn", async (context) => ({
        cancelled: await this.#agentRuntime.cancelTurn(
          context.agentInstanceGuard,
        ),
      })),
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
      registerAgentRequest("new_session", async (context, { mutationId }) => {
        const opened = await this.#agentRuntime.createSession(
          toSessionId(mutationId),
        );
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
      registerAgentRequest("tool_catalog", (context) => ({
        tools: context.agentInstanceGuard.value.features.agentTools
          .list()
          .map(({ tool }) => ({
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
        invokeAgentChannel: (context, canonicalId, payload) =>
          this.#agentRuntime.invokeFeatureChannel(
            context.agentInstanceGuard,
            canonicalId,
            payload,
          ),
        viewpointWebRoutes: this.#viewpointWebRoutes,
        surfaces: this.#surfaces,
      },
    };

    this.#reloadCoordinator = createWorkspaceReloadCoordinator({
      acquireReloadAdmission: () => this.#agentRuntime.acquireReloadAdmission(),
      commitTurnState: () => this.#agentRuntime.commitFeatureTurnState(),
      loadFeatures: () => this.#loadFeatures(),
      featureCleanupErrors: (activation) => activation.cleanupErrors ?? [],
      reloadAgentFeatures: () => this.#agentRuntime.reloadFeatureInstances(),
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
      activation = await this.#loadFeatures();
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
  async #reload(): Promise<ReloadResult> {
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

  async createAttachment(
    admission: AttachmentAdmission,
  ): Promise<CreatedAttachment> {
    if (this.#disposed) throw new Error("Workspace runtime is disposed");
    switch (admission.kind) {
      case "session":
        return this.#createAcceptedAttachment(admission.target);
      case "fallback": {
        const opened = await this.#openFallbackSession();
        return this.#createAcceptedAttachment(opened.target, opened.manager);
      }
      case "new-session": {
        const opened = await this.#agentRuntime.createSession();
        return this.#createAcceptedAttachment(opened.target, opened.manager);
      }
    }
  }

  async dispatchViewpointWebRequest(
    request: ViewpointWebRequest,
  ): Promise<ViewpointWebResponse> {
    if (this.#disposed) {
      return toWebRouteErrorResponse(404, "Web route not found.");
    }

    const retainedTargetGuard = this.#attachmentWebBindings.retainTarget(
      request.binding,
    );
    if (!retainedTargetGuard) {
      return toWebRouteErrorResponse(404, "Web route not found.");
    }

    using targetGuard = retainedTargetGuard;
    await using operation = this.#dispatchOperations.acquire();
    const resolved = this.#viewpointWebRoutes.resolve(request.namespace, {
      method: request.method,
      pathname: request.pathname,
      searchParams: new URLSearchParams(request.queryString),
    });
    if (!resolved.ok) {
      return toWebRouteErrorResponse(resolved.status, resolved.reason);
    }

    try {
      return await targetGuard.value.features.webRoutes.invoke(
        resolved.value,
        operation.signal,
      );
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error(String(thrown));
      webRouteLog.error(
        {
          namespace: request.namespace,
          method: request.method,
          pathname: request.pathname,
          sessionId: targetGuard.value.target.sessionId,
          err: error.message,
        },
        "viewpoint_web_route_failed",
      );
      return toWebRouteErrorResponse(500, "Internal web route error.");
    }
  }

  async #createAcceptedAttachment(
    acceptedTarget: SessionTarget,
    openedManager?: SessionManager,
  ): Promise<CreatedAttachment> {
    assertSupportedSessionTarget(acceptedTarget);
    const guard = await this.#agentRuntime.acquire(
      acceptedTarget,
      openedManager,
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
    context: Omit<AttachmentDispatchContext, "signal">,
    request: CanonicalRequest,
    disposeOperationGuard: () => void,
  ): PreparedDispatch {
    if (this.#disposed) {
      disposeOperationGuard();
      throw new Error("Workspace runtime is disposed");
    }

    const lifetime = new AsyncDisposableStack();
    lifetime.defer(disposeOperationGuard);
    try {
      const operation = lifetime.use(this.#dispatchOperations.acquire());
      return this.#channels.prepare(
        { ...context, signal: operation.signal },
        request,
        () => lifetime.disposeAsync(),
      );
    } catch (error) {
      void lifetime.disposeAsync().catch(() => undefined);
      throw error;
    }
  }

  registerWebBinding(
    targetGuard: AgentInstanceGuard,
  ): AttachmentWebBindingHandle {
    return this.#attachmentWebBindings.register(targetGuard);
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
      await this.#lifetime[Symbol.asyncDispose]();
    })();
    return this.#disposal;
  }

  async #loadFeatures(): Promise<ActivationResult> {
    const activation = await loadFeatures(
      this.#currentSources(),
      this.#featuresBag,
      this.#substrate,
    );
    this.#agentFeatures = activation.activated.flatMap((feature) =>
      feature.agent ? [feature.agent] : [],
    );
    return activation;
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

function toWebRouteErrorResponse(
  status: 400 | 404 | 405 | 500,
  body: string,
): ViewpointWebResponse {
  return { status, content: "text", body };
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
