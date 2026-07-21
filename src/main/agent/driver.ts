// agent driver.
//
// Wraps Pi's `AgentSessionRuntime` and normalizes each active session's live
// event stream into the same transcript item model used
// for persisted history replay in src/shared/ipc.ts.
//
// Why dynamic `import()`: pi is an ESM-only package and the main bundle
// is CJS. A static `import` would be rewritten to `require()` by the
// bundler and fail at runtime. Dynamic `import()` is preserved through
// the build and runs as a real ESM load. The `import type` line beside
// it is erased at compile time, so we still get full pi types in the
// IDE/typechecker without any runtime cost.
//
// Lifetime management uses the conventions in src/main/lifecycle.ts:
// every cleanup-requiring registration goes into the driver's
// DisposableBag, and disposing the driver tears everything down at
// once.

import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  AgentSessionServices,
  CreateAgentSessionRuntimeFactory,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import type {
  AgentEvent,
  AgentStatus,
  ModelCatalog,
  ModelFavoriteUpdate,
  ModelRef,
  ProviderAuthCatalog,
  OAuthFlowState,
  ProviderCredentials,
  SessionHistoryResponse,
  SessionSummary,
  TranscriptItem,
} from "@uix/api/agent-channels";
import type { SettingsHandleFrom } from "@uix/api/settings";
import type { Workspace } from "../workspace";

import { join } from "node:path";
import process from "node:process";

import { DisposableBag, subscribe } from "../lifecycle";
import { createLogger } from "../log";

const log = createLogger("agent");
import { TurnStateRegistry } from "../turn-state/registry";

import { createOAuthFlowCoordinator } from "./auth-flow";
import { agentWorkspaceSettings } from "./settings";
import { deriveSelectedBranchProjection } from "./branch-projection";
import { resolveSessionFileById } from "./session-files";
import {
  sessionWorkspaceSettings,
  type SelectedSessionSetting,
} from "./session-settings";
import {
  readRecentSessionSummaries,
  readSessionSummary,
} from "./session-summary";
import {
  deriveProviderAuthCatalogForEnvironment,
  findOfferedCredentialMethod,
  resolveOAuthStartAction,
} from "./auth-providers";
import { type AgentInstaller, createUixCoreExtension } from "./installers";
import {
  createTranscriptItemIdentity,
  type TranscriptItemIdentity,
} from "./transcript-item-identity";
import { createTurnStateLifecycle } from "./turn-state-lifecycle";
import {
  buildAgentContextMessage,
  buildAgentContextVocabularySection,
  type AgentContextRegistry,
} from "../agent-context/registry";
import {
  buildAgentSystemPromptSection,
  type AgentSystemPromptRegistry,
} from "../agent-system-prompt/registry";
import {
  createAgentSkillInstaller,
  type AgentSkillRegistry,
} from "../agent-skills/registry";
import { createSystemPromptAssembler } from "./system-prompt";
import {
  extractTranscriptText,
  parseCustomTranscriptItem,
  getMessageRole,
  toIpcValue,
} from "./transcript";

/**
 * The driver itself is a Disposable so callers can hand it to a Bag
 * and forget about it.
 */
export interface AgentDriver extends Disposable {
  prompt(text: string): Promise<void>;
  /** Reload the Pi resource tier if it has already been initialized. */
  reloadPiResources(): Promise<boolean>;
  /**
   * Snapshot turn state from the currently active feature instances and commit
   * any changes to the selected session branch. Returns false while restoration
   * into those instances has not settled.
   */
  /**
   * Commit current feature turn state to the selected branch. Returns false
   * while restoration into the active feature instances is pending.
   */
  commitFeatureTurnState(): Promise<boolean>;
  /** Restore the selected branch into the active feature instances. */
  restoreFeatureTurnState(): Promise<void>;
  /**
   * Kick the eager, auth-free selected-session load and turn-state restore off
   * the boot path. Safe to call before any prompt; lets sessionHistory()
   * resolve without waiting on a prompt.
   */
  init(): void;
  /** Read one session without activating a non-selected target. */
  sessionHistory(sessionId?: string): Promise<SessionHistoryResponse>;
  /** Read recent durable session summaries without opening Pi services. */
  listSessionSummaries(limit: number): Promise<SessionSummary[]>;
  /** Replace the active agent slot's selected graph with a fresh session. */
  newSession(): Promise<SessionSummary>;
  /** Available models with workspace-local favorite status. */
  listModels(): Promise<ModelCatalog>;
  /** Persist a favorite update and return the refreshed available model catalog. */
  setModelFavorite(update: ModelFavoriteUpdate): Promise<ModelCatalog>;
  /** Live session model (when known) plus the workspace default. */
  status(): AgentStatus;
  /**
   * Validate against pi's available models, persist as the workspace
   * default, and — when a live session exists — switch it via
   * `session.setModel`, producing native pi `model_change` state.
   */
  selectModel(ref: ModelRef): Promise<AgentStatus>;
  listAuthProviders(): Promise<ProviderAuthCatalog>;
  saveProviderCredentials(credentials: ProviderCredentials): Promise<void>;
  currentOAuthFlow(): OAuthFlowState | undefined;
  beginOAuthFlow(
    providerId: string,
    actionId: string,
  ): Promise<{ flowId: string }>;
  answerOAuthFlow(flowId: string, promptId: string, value: string): void;
  reopenOAuthFlow(flowId: string): Promise<void>;
  cancelOAuthFlow(flowId: string): void;
}

export interface AgentDriverOptions {
  /** Forwarded to the renderer (over IPC). */
  onEvent: (event: AgentEvent) => void;
  /** UIX-core agent installers composed into the in-process pi extension. */
  agentInstallers?: readonly AgentInstaller[];
  /** Cockpit-private turn-state registry, installed by the driver. */
  turnState?: TurnStateRegistry;
  /** Stable feature-owned system-prompt sections. */
  agentSystemPrompt?: AgentSystemPromptRegistry;
  /** Feature-supplied Pi skills discovered at session start/reload. */
  agentSkills?: AgentSkillRegistry;
  /** Cockpit→agent context registry, installed by the driver. */
  agentContext?: AgentContextRegistry;
  /** State root (pins the session dir) + agent cwd. */
  workspace: Workspace;
  /** App-owned Pi profile shared across UIX workspaces. */
  piProfileDir: string;
  /**
   * Workspace `agent` settings namespace; holds model defaults and favorites.
   * Without a default, UIX passes no model and pi's own resolution applies —
   * including resolving to no model at all when nothing is authenticated.
   */
  agentSettings?: SettingsHandleFrom<typeof agentWorkspaceSettings>;
  /** Durable identity and cached label for the workspace's selected session. */
  sessionSettings?: SettingsHandleFrom<typeof sessionWorkspaceSettings>;
  /** Fired whenever live/default model status changes. */
  onStatusChange?: (status: AgentStatus) => void;
  /** Opens only URLs supplied by the active Pi OAuth provider. */
  openExternal: (url: string) => void | Promise<void>;
  /** Fired for generic provider-login state transitions. */
  onOAuthFlowState: (state: OAuthFlowState) => void;
  /** Fired after auth changes refresh available models. */
  onModelAvailabilityChange: () => void;
}

export function createAgentDriver(opts: AgentDriverOptions): AgentDriver {
  const driverBag = new DisposableBag();
  const sessionBag = new DisposableBag();

  // The bootstrap manager stays cheap and auth-free so startup history does
  // not create a model registry or load extensions. The runtime remains lazy
  // until the first prompt or session mutation, then becomes the authority for
  // the selected manager and Pi services across every replacement generation.
  let bootstrapManager: SessionManager | undefined;
  let inFlightBootstrapManagerOpen: Promise<SessionManager> | undefined;
  let inFlightBootstrapTurnStateRestore: Promise<SessionManager> | undefined;
  let runtime: AgentSessionRuntime | undefined;
  let inFlightRuntimeOpen: Promise<AgentSessionRuntime> | undefined;

  // Before a runtime exists, model/auth requests may create the exact services
  // generation that initial runtime creation will consume.
  let preRuntimeServices: AgentSessionServices | undefined;
  let inFlightServicesCreate: Promise<AgentSessionServices> | undefined;

  // Synchronous projection emitted to renderer consumers. Pi's model-select
  // hook and active-session binding keep it aligned with runtime.session.
  let currentModel: ModelRef | undefined;
  let disposed = false;

  const transcriptItemIdentityByManager = new WeakMap<
    SessionManager,
    TranscriptItemIdentity
  >();
  const sessionDir = join(opts.workspace.stateRoot, ".uix", "sessions");
  const turnStateLifecycle = opts.turnState
    ? driverBag.add(
        createTurnStateLifecycle({
          registry: opts.turnState,
          cwd: opts.workspace.agentCwd,
        }),
      )
    : undefined;

  const agentInstallers = [...(opts.agentInstallers ?? [])];
  if (turnStateLifecycle) {
    agentInstallers.push(turnStateLifecycle.agentInstaller);
  }
  if (opts.agentSkills) {
    agentInstallers.push(createAgentSkillInstaller(opts.agentSkills));
  }
  const systemPromptRegistry = opts.agentSystemPrompt;
  const contextRegistry = opts.agentContext;
  if (systemPromptRegistry || contextRegistry) {
    agentInstallers.push(
      createSystemPromptAssembler([
        ...(systemPromptRegistry
          ? [() => buildAgentSystemPromptSection(systemPromptRegistry)]
          : []),
        ...(contextRegistry
          ? [() => buildAgentContextVocabularySection(contextRegistry)]
          : []),
      ]),
    );
  }
  agentInstallers.push((pi) => {
    pi.on("model_select", (event) => {
      currentModel = { provider: event.model.provider, id: event.model.id };
      emitStatus();
    });
  });

  async function createServices(
    cwd: string,
    agentDir: string,
  ): Promise<AgentSessionServices> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    return sdk.createAgentSessionServices({
      cwd,
      agentDir,
      resourceLoaderOptions: {
        extensionFactories: [createUixCoreExtension(agentInstallers)],
      },
    });
  }

  function getServices(): Promise<AgentSessionServices> {
    if (disposed) return Promise.reject(new Error("Agent driver is disposed"));
    if (runtime) return Promise.resolve(runtime.services);
    if (preRuntimeServices) return Promise.resolve(preRuntimeServices);
    if (inFlightServicesCreate) return inFlightServicesCreate;

    const creation: Promise<AgentSessionServices> = createServices(
      opts.workspace.agentCwd,
      opts.piProfileDir,
    )
      .then((services) => {
        if (disposed) throw new Error("Agent driver is disposed");
        preRuntimeServices = services;
        return services;
      })
      .finally(() => {
        if (inFlightServicesCreate === creation) {
          inFlightServicesCreate = undefined;
        }
      });
    inFlightServicesCreate = creation;
    return creation;
  }

  async function registry(): Promise<ModelRegistry> {
    return (await getServices()).modelRegistry;
  }

  const oauth = driverBag.add(
    createOAuthFlowCoordinator({
      modelRegistry: registry,
      openExternal: opts.openExternal,
      onState: opts.onOAuthFlowState,
      onAvailabilityChange: opts.onModelAvailabilityChange,
    }),
  );

  function status(): AgentStatus {
    const defaultModel = opts.agentSettings?.get("defaultModel");
    return {
      ...(currentModel && { model: currentModel }),
      ...(defaultModel && { defaultModel }),
    };
  }

  function emitStatus(): void {
    opts.onStatusChange?.(status());
  }

  function getFavoriteModels(): ModelRef[] {
    return opts.agentSettings?.get("favoriteModels") ?? [];
  }

  async function listModels(): Promise<ModelCatalog> {
    const modelRegistry = await registry();
    // Pick up models.json edits and freshly configured auth since the
    // registry was created.
    modelRegistry.refresh();
    const favorites = getFavoriteModels();
    return modelRegistry.getAvailable().map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      favorite: favorites.some(
        (ref) => ref.provider === model.provider && ref.id === model.id,
      ),
    }));
  }

  function commitSessionSelection(summary: SessionSummary): void {
    const selected = opts.sessionSettings?.get("selected");
    if (
      selected?.sessionId === summary.sessionId &&
      selected.displayLabel === summary.displayLabel
    ) {
      return;
    }
    opts.sessionSettings?.set("selected", {
      sessionId: summary.sessionId,
      displayLabel: summary.displayLabel,
    } satisfies SelectedSessionSetting);
  }

  function getBootstrapManager(): Promise<SessionManager> {
    if (disposed) return Promise.reject(new Error("Agent driver is disposed"));
    if (bootstrapManager) return Promise.resolve(bootstrapManager);
    if (inFlightBootstrapManagerOpen) return inFlightBootstrapManagerOpen;

    const opening: Promise<SessionManager> = openManager()
      .then((manager) => {
        if (disposed) throw new Error("Agent driver is disposed");
        bootstrapManager = manager;
        return manager;
      })
      .finally(() => {
        if (inFlightBootstrapManagerOpen === opening) {
          inFlightBootstrapManagerOpen = undefined;
        }
      });
    inFlightBootstrapManagerOpen = opening;
    return opening;
  }

  function restoreBootstrapTurnState(): Promise<SessionManager> {
    if (disposed) return Promise.reject(new Error("Agent driver is disposed"));
    if (
      bootstrapManager &&
      (!turnStateLifecycle ||
        turnStateLifecycle.isRestorationSettled(bootstrapManager))
    ) {
      return Promise.resolve(bootstrapManager);
    }
    if (inFlightBootstrapTurnStateRestore) {
      return inFlightBootstrapTurnStateRestore;
    }

    const registrySnapshot = turnStateLifecycle?.toRegistrySnapshot();
    const restoration = getBootstrapManager()
      .then(async (manager) => {
        if (registrySnapshot && turnStateLifecycle) {
          await turnStateLifecycle.restore(manager, registrySnapshot);
        }
        if (disposed) throw new Error("Agent driver is disposed");
        return manager;
      })
      .finally(() => {
        if (inFlightBootstrapTurnStateRestore === restoration) {
          inFlightBootstrapTurnStateRestore = undefined;
        }
      });
    inFlightBootstrapTurnStateRestore = restoration;
    return restoration;
  }

  async function openManager(): Promise<SessionManager> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const { agentCwd } = opts.workspace;
    // Pin the session dir under .uix on the stable state root, not pi's
    // cwd-derived default, so the session file stays with the canvases and does
    // not move when the agent later relocates to a worktree.
    const selected = opts.sessionSettings?.get("selected");
    const selectedFile = selected
      ? await resolveSessionFileById(sessionDir, selected.sessionId)
      : undefined;

    let manager: SessionManager | undefined;
    if (selectedFile) {
      try {
        manager = sdk.SessionManager.open(selectedFile, sessionDir);
      } catch {
        // A stale or unreadable selected file falls through to the normal
        // newest-session recovery path.
      }
    }
    if (!manager) {
      try {
        manager = sdk.SessionManager.continueRecent(agentCwd, sessionDir);
      } catch {
        manager = sdk.SessionManager.create(agentCwd, sessionDir);
      }
    }

    commitSessionSelection(await readSessionSummary(manager));
    return manager;
  }

  function getOrObserveTranscriptItemIdentity(
    manager: SessionManager,
  ): TranscriptItemIdentity {
    const existing = transcriptItemIdentityByManager.get(manager);
    if (existing) return existing;

    const identity = createTranscriptItemIdentity();
    identity.onUserMessage((durableId, message) => {
      const text = extractTranscriptText(message);
      if (!text) return;
      opts.onEvent({
        type: "transcript_append",
        item: { id: durableId, kind: "user", text },
      });
    });
    // Pi persists after message_end and has no post-persist event, so this must
    // wrap the manager before the AgentSession receives it.
    identity.observe(manager);
    transcriptItemIdentityByManager.set(manager, identity);
    return identity;
  }

  function bindActiveSession(session: AgentSession): void {
    const identity = transcriptItemIdentityByManager.get(
      session.sessionManager,
    );
    if (!identity) {
      throw new Error(
        "Session manager transcript-item identity is unavailable",
      );
    }

    sessionBag.clear();
    currentModel = session.model
      ? { provider: session.model.provider, id: session.model.id }
      : undefined;
    emitStatus();
    sessionBag.add(
      subscribe<AgentSessionEvent>(
        session,
        createLiveTranscriptForwarder(opts.onEvent, identity),
      ),
    );
  }

  async function openRuntime(): Promise<AgentSessionRuntime> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const initialManager = await restoreBootstrapTurnState();
    // The bootstrap request may have become obsolete while its manager opened.
    // Runtime creation still requires the currently active cells to be settled.
    await turnStateLifecycle?.restoreCurrent(initialManager);
    let initialRuntimeCreated = false;

    const createRuntime: CreateAgentSessionRuntimeFactory = async ({
      cwd,
      agentDir,
      sessionManager,
      sessionStartEvent,
    }) => {
      getOrObserveTranscriptItemIdentity(sessionManager);
      // The first runtime consumes any services already opened by model/auth
      // UI. Replacement generations recreate Pi's cwd-bound resources.
      const sessionServices = initialRuntimeCreated
        ? await createServices(cwd, agentDir)
        : await getServices();
      const modelRegistry = sessionServices.modelRegistry;

      // The workspace default applies only when the selected branch carries no
      // native model change. Otherwise Pi restores branch-owned model state.
      let initialModel: ReturnType<ModelRegistry["find"]>;
      if (
        !sessionManager
          .getBranch()
          .some((entry) => entry.type === "model_change")
      ) {
        const ref = opts.agentSettings?.get("defaultModel");
        if (ref) {
          const found = modelRegistry.find(ref.provider, ref.id);
          if (found && modelRegistry.hasConfiguredAuth(found)) {
            initialModel = found;
          } else {
            log.warn({ model: ref }, "workspace_default_model_unavailable");
          }
        }
      }

      const result = await sdk.createAgentSessionFromServices({
        services: sessionServices,
        sessionManager,
        ...(sessionStartEvent && { sessionStartEvent }),
        ...(initialModel && { model: initialModel }),
      });
      initialRuntimeCreated = true;
      return {
        ...result,
        services: sessionServices,
        diagnostics: sessionServices.diagnostics,
      };
    };

    const openedRuntime = await sdk.createAgentSessionRuntime(createRuntime, {
      cwd: opts.workspace.agentCwd,
      agentDir: opts.piProfileDir,
      sessionManager: initialManager,
    });
    if (disposed) {
      await openedRuntime.dispose();
      throw new Error("Agent driver is disposed");
    }
    openedRuntime.setBeforeSessionInvalidate(() => {
      sessionBag.clear();
      currentModel = undefined;
      turnStateLifecycle?.clearRestoration();
    });
    openedRuntime.setRebindSession(async (session) => {
      bindActiveSession(session);
      await turnStateLifecycle?.restoreCurrent(session.sessionManager);
    });
    bindActiveSession(openedRuntime.session);
    return openedRuntime;
  }

  function getRuntime(): Promise<AgentSessionRuntime> {
    if (disposed) return Promise.reject(new Error("Agent driver is disposed"));
    if (runtime) return Promise.resolve(runtime);
    if (inFlightRuntimeOpen) return inFlightRuntimeOpen;

    const opening: Promise<AgentSessionRuntime> = openRuntime()
      .then(async (openedRuntime) => {
        if (disposed) {
          await openedRuntime.dispose();
          throw new Error("Agent driver is disposed");
        }
        runtime = openedRuntime;
        bootstrapManager = undefined;
        preRuntimeServices = undefined;
        return openedRuntime;
      })
      .finally(() => {
        if (inFlightRuntimeOpen === opening) {
          inFlightRuntimeOpen = undefined;
        }
      });
    inFlightRuntimeOpen = opening;
    return opening;
  }

  return {
    init() {
      // Fire the eager manager load and state restore; swallow rejection here
      // so an early failure doesn't surface as an unhandled rejection.
      // prompt()/sessionHistory() retry.
      void restoreBootstrapTurnState().catch(() => {});
    },

    status,
    listModels,

    async setModelFavorite({ provider, id, favorite }) {
      if (!opts.agentSettings) {
        throw new Error("Workspace agent settings are unavailable");
      }

      const current = getFavoriteModels();
      const alreadyFavorite = current.some(
        (ref) => ref.provider === provider && ref.id === id,
      );
      if (favorite && !alreadyFavorite) {
        const modelRegistry = await registry();
        modelRegistry.refresh();
        if (!modelRegistry.find(provider, id)) {
          throw new Error(`Unknown model: ${provider}/${id}`);
        }
        opts.agentSettings.set("favoriteModels", [
          ...current,
          { provider, id },
        ]);
      } else if (!favorite && alreadyFavorite) {
        opts.agentSettings.set(
          "favoriteModels",
          current.filter((ref) => ref.provider !== provider || ref.id !== id),
        );
      }

      return listModels();
    },

    listAuthProviders: async () =>
      deriveProviderAuthCatalogForEnvironment(await registry(), process.env),

    async saveProviderCredentials({ providerId, methodId, values }) {
      const modelRegistry = await registry();
      const method = findOfferedCredentialMethod(
        modelRegistry,
        providerId,
        methodId,
      );
      if (!method) {
        throw new Error(
          `Credential method is not currently offered: ${providerId}/${methodId}`,
        );
      }
      for (const field of method.fields) {
        if (
          field.required &&
          (values[field.id] === undefined || values[field.id].trim() === "")
        ) {
          throw new Error(`Credential field is required: ${field.id}`);
        }
      }

      // The generic method currently offered by the catalog is an API key.
      // Keep the wire shape generic without adding a serializer framework
      // before another credential method needs one.
      const apiKey = values.apiKey;
      if (method.id !== "api-key" || apiKey === undefined) {
        throw new Error(
          `Credential method is not supported: ${providerId}/${methodId}`,
        );
      }
      modelRegistry.authStorage.set(providerId, {
        type: "api_key",
        key: apiKey,
      });
      modelRegistry.refresh();
      opts.onModelAvailabilityChange();
    },

    currentOAuthFlow: () => oauth.current(),
    beginOAuthFlow(providerId, actionId) {
      const action = resolveOAuthStartAction(providerId, actionId);
      if (!action) {
        return Promise.reject(
          new Error(
            `OAuth start action is not offered: ${providerId}/${actionId}`,
          ),
        );
      }
      return oauth.begin(providerId, actionId, action.initialSelection);
    },
    answerOAuthFlow: (flowId, promptId, value) =>
      oauth.answer(flowId, promptId, value),
    reopenOAuthFlow: (flowId) => oauth.reopen(flowId),
    cancelOAuthFlow: (flowId) => oauth.cancel(flowId),

    async selectModel(ref) {
      const modelRegistry = await registry();
      const model = modelRegistry.find(ref.provider, ref.id);
      if (!model || !modelRegistry.hasConfiguredAuth(model)) {
        throw new Error(`Model is not available: ${ref.provider}/${ref.id}`);
      }
      opts.agentSettings?.set("defaultModel", {
        provider: ref.provider,
        id: ref.id,
      });
      if (runtime) {
        // Native pi state: appends a model_change entry, persists pi's own
        // defaults, reclamps thinking. The model_select installer mirrors
        // currentModel; the extra assignment below is a same-payload no-op.
        await runtime.session.setModel(model);
        currentModel = { provider: ref.provider, id: ref.id };
      }
      emitStatus();
      return status();
    },

    async sessionHistory(sessionId) {
      const selectedManager =
        runtime?.session.sessionManager ?? (await restoreBootstrapTurnState());
      let manager = selectedManager;
      if (
        sessionId !== undefined &&
        sessionId !== selectedManager.getSessionId()
      ) {
        const sessionFile = await resolveSessionFileById(
          selectedManager.getSessionDir(),
          sessionId,
        );
        if (!sessionFile) throw new Error(`Unknown session: ${sessionId}`);
        const sdk = await import("@earendil-works/pi-coding-agent");
        manager = sdk.SessionManager.open(
          sessionFile,
          selectedManager.getSessionDir(),
        );
      }

      const session = await readSessionSummary(manager);
      if (manager === selectedManager) commitSessionSelection(session);
      return {
        session,
        transcript: deriveSelectedBranchProjection(
          manager.getBranch(),
          turnStateLifecycle?.toRegistrySnapshot(),
        ).transcript,
      };
    },

    listSessionSummaries: (limit) =>
      readRecentSessionSummaries(sessionDir, limit),

    async commitFeatureTurnState() {
      if (disposed) throw new Error("Agent driver is disposed");
      if (!turnStateLifecycle) return true;
      const manager = runtime?.session.sessionManager ?? bootstrapManager;
      return turnStateLifecycle.commitIfReady(manager);
    },

    async restoreFeatureTurnState() {
      if (disposed) throw new Error("Agent driver is disposed");
      const manager =
        runtime?.session.sessionManager ?? (await getBootstrapManager());
      await turnStateLifecycle?.restoreCurrent(manager);
      commitSessionSelection(await readSessionSummary(manager));
    },

    async newSession() {
      const activeRuntime = await getRuntime();
      if (activeRuntime.session.isStreaming) {
        throw new Error(
          "Cannot create a new session while the agent is running",
        );
      }

      await turnStateLifecycle?.commit(activeRuntime.session.sessionManager);
      const result = await activeRuntime.newSession();
      if (result.cancelled) {
        throw new Error("New session was cancelled");
      }
      const session = await readSessionSummary(
        activeRuntime.session.sessionManager,
      );
      commitSessionSelection(session);
      return session;
    },

    async reloadPiResources() {
      // Reload only tiers already in use. A live session owns Pi's native
      // extension rebind; before a session exists, recreate the coherent
      // services tier so extension provider registrations cannot accumulate.
      if (runtime || inFlightRuntimeOpen) {
        const activeRuntime = runtime ?? (await getRuntime());
        await activeRuntime.session.reload();
        return true;
      }
      if (!preRuntimeServices && !inFlightServicesCreate) return false;
      await getServices();
      // A concurrent prompt may have consumed the pre-runtime generation while
      // reload waited for it. In that case the live session owns resource reload.
      if (runtime || inFlightRuntimeOpen) {
        const activeRuntime = runtime ?? (await getRuntime());
        await activeRuntime.session.reload();
        return true;
      }
      preRuntimeServices = undefined;
      await getServices();
      return true;
    },

    async prompt(text) {
      // No echo here: the renderer already shows its optimistic pending row,
      // and the authoritative keyed row is emitted by the onUserMessage
      // observer when pi persists. A prompt that fails before persistence
      // truthfully contributes no user row to the feed — the renderer's
      // unconfirmed row plus the error item below are the whole record.
      try {
        // Runtime opening is retryable; getRuntime() shares only the current
        // in-flight operation and records authority separately on success.
        const session = (await getRuntime()).session;

        // Submit-prep ordering: turn-state entries and the hidden uix.state
        // message must be ordered BEFORE the user message in the session tree
        // so branch navigation to the gap before a user message still has the
        // state explaining that turn.  We write both before calling
        // session.prompt(text).
        if (turnStateLifecycle) {
          log.trace("submitting_turn_state");
          await turnStateLifecycle.commit(session.sessionManager);
        }
        if (opts.agentContext) {
          log.trace("building_agent_context");
          const message = await buildAgentContextMessage(
            session.sessionManager,
            opts.agentContext,
          );
          if (message) {
            // Push directly into agent state so the model sees it adjacent to
            // the user message. Pi persists it during agent processing via its
            // internal message_end handler (we skip sendCustomMessage to avoid
            // double-persisting an entry that is already being recorded by the
            // agent loop).
            session.agent.state.messages.push({
              role: "custom",
              customType: "uix.state",
              content: message.content,
              display: false,
              details: message.details,
              timestamp: Date.now(),
            });
          }
        }

        // Send the human's text verbatim. Agent-run context rides the
        // uix.state entry pushed above; the stored user entry is exactly
        // what the human typed.
        await session.prompt(text);
      } catch (err) {
        opts.onEvent({
          type: "transcript_append",
          item: {
            id: liveId("error"),
            kind: "error",
            message: errorMessage(err),
          },
        });
        // Renderer treats agent_end as "you can send again" — emit it on error
        // so the composer unlocks.
        opts.onEvent({ type: "agent_end" });
      }
    },

    [Symbol.dispose]() {
      if (disposed) return;
      disposed = true;
      const activeRuntime = runtime;
      driverBag[Symbol.dispose]();
      sessionBag[Symbol.dispose]();
      inFlightRuntimeOpen = undefined;
      runtime = undefined;
      inFlightBootstrapManagerOpen = undefined;
      bootstrapManager = undefined;
      inFlightBootstrapTurnStateRestore = undefined;
      inFlightServicesCreate = undefined;
      preRuntimeServices = undefined;
      currentModel = undefined;
      if (activeRuntime) {
        void activeRuntime.dispose().catch((err) => {
          log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "runtime_dispose_failed",
          );
        });
      }
    },
  };
}

function createLiveTranscriptForwarder(
  emit: (e: AgentEvent) => void,
  identity: TranscriptItemIdentity,
) {
  let assistant: Extract<TranscriptItem, { kind: "assistant" }> | undefined;
  const tools = new Map<string, Extract<TranscriptItem, { kind: "tool" }>>();

  function append(item: TranscriptItem): void {
    emit({ type: "transcript_append", item });
  }

  function replace(item: TranscriptItem): void {
    emit({ type: "transcript_replace", item });
  }

  function ensureAssistant(): Extract<TranscriptItem, { kind: "assistant" }> {
    if (assistant) return assistant;
    assistant = {
      id: liveId("assistant"),
      kind: "assistant",
      text: "",
      complete: false,
    };
    append(assistant);
    return assistant;
  }

  return (event: AgentSessionEvent): void => {
    switch (event.type) {
      case "agent_start":
        emit({ type: "agent_start" });
        return;

      case "turn_start":
        emit({ type: "turn_start" });
        return;

      case "turn_end":
        emit({ type: "turn_end" });
        return;

      case "message_start":
        if (getMessageRole(event.message) === "assistant") ensureAssistant();
        return;

      case "message_update": {
        const inner = event.assistantMessageEvent;
        if (inner.type === "text_delta") {
          // Accumulate locally (message_end falls back to this text when the
          // final message extracts empty) but ship only the increment; the
          // renderer accumulates its copy from partials.
          const current = ensureAssistant();
          assistant = { ...current, text: current.text + inner.delta };
          emit({
            type: "transcript_partial",
            id: current.id,
            text: inner.delta,
          });
        }
        return;
      }

      case "message_end": {
        const role = getMessageRole(event.message);
        if (role === "assistant") {
          const current = ensureAssistant();
          const finalText =
            extractTranscriptText(event.message) || current.text;
          // Final content lands under the pre-key handle first, so display
          // never depends on the append wrapper; the rekey replace follows
          // in the same tick when pi persists this exact message object.
          const final = { ...current, text: finalText, complete: true };
          replace(final);
          assistant = undefined;
          identity.expectMessageKey(event.message, (durableId) => {
            emit({
              type: "transcript_replace",
              item: { ...final, id: durableId },
              previousId: final.id,
            });
          });
          return;
        }

        // Displayed custom messages don't stream, so hold the row one tick
        // and append it already keyed when pi persists the entry (pi never
        // hands the manager the CustomMessage object, so there is no handle
        // path to correlate a rekey through).
        const custom = parseCustomTranscriptItem("pending", event.message);
        if (custom) {
          identity.expectCustomEntry((durableId) => {
            append({ ...custom, id: durableId });
          });
        }
        return;
      }

      case "tool_execution_start": {
        // Born keyed: pi persisted the assistant message (with this row's
        // toolCall block) before execution started, so the durable replay
        // derivation is already known. The liveId fallback only fires if pi
        // reorders persistence, degrading to a pre-key row.
        const item = {
          id: identity.toolRowId(event.toolCallId) ?? liveId("tool"),
          kind: "tool" as const,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: toIpcValue(event.args),
          complete: false,
        };
        tools.set(event.toolCallId, item);
        append(item);
        return;
      }

      case "tool_execution_update": {
        // Tool partials are tool-defined replacement snapshots (e.g. bash
        // ships its bounded output tail every ~100ms), so forward the payload
        // alone — no point resending the row's args on every tick. The stored
        // row stays as appended; the completion replace discards partials.
        const current = tools.get(event.toolCallId);
        if (!current) return;
        emit({
          type: "transcript_partial",
          id: current.id,
          partialResult: toIpcValue(event.partialResult),
        });
        return;
      }

      case "tool_execution_end": {
        const existing = tools.get(event.toolCallId);
        const current =
          existing ??
          ({
            id: identity.toolRowId(event.toolCallId) ?? liveId("tool"),
            kind: "tool" as const,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            complete: false,
          } satisfies Extract<TranscriptItem, { kind: "tool" }>);
        const item: Extract<TranscriptItem, { kind: "tool" }> = {
          id: current.id,
          kind: "tool",
          toolCallId: current.toolCallId,
          toolName: event.toolName,
          complete: true,
          args: current.args,
          result: toIpcValue(event.result),
          isError: event.isError,
        };
        tools.delete(event.toolCallId);
        if (existing) replace(item);
        else append(item);
        return;
      }

      case "agent_end":
        emit({ type: "agent_end" });
        return;

      default:
        return;
    }
  };
}

let nextLiveId = 1;
function liveId(kind: string): string {
  return `live:${kind}:${nextLiveId++}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
