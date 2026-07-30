// agent driver.
//
// Owns Pi's `AgentSessionRuntime` lifecycle and coordinates the selected
// session, services, feature state, transcript observation, and agent controls.
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

import { join } from "node:path";

import type {
  AgentSession,
  AgentSessionRuntime,
  AgentSessionServices,
  CreateAgentSessionRuntimeFactory,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentEvent,
  AgentStatus,
  ModelCatalog,
  ModelFavoriteUpdate,
  ModelRef,
  ProviderAuthCatalog,
  ProviderAuthFlowSnapshot,
  ProviderAuthType,
  SessionHistoryResponse,
  SessionSummary,
} from "@uix/api/agent-channels";
import type { SettingsHandleFrom } from "@uix/api/settings";

import {
  buildAgentContextMessage,
  buildAgentContextVocabularySection,
  type AgentContextRegistry,
} from "../agent-context/registry";
import {
  createAgentSkillInstaller,
  type AgentSkillRegistry,
} from "../agent-skills/registry";
import {
  buildAgentSystemPromptSection,
  type AgentSystemPromptRegistry,
} from "../agent-system-prompt/registry";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";
import type { TurnStateRegistry } from "../turn-state/registry";
import type { Workspace } from "../workspace";

import { deriveProviderAuthCatalog } from "./auth-providers";
import { createProviderAuthFlowCoordinator } from "./provider-auth-flow";
import { deriveSelectedBranchProjection } from "./branch-projection";
import { type AgentInstaller, createUixCoreExtension } from "./installers";
import { resolveSessionFileById } from "./session-files";
import {
  sessionWorkspaceSettings,
  type SelectedSessionSetting,
} from "./session-settings";
import {
  readRecentSessionSummaries,
  readSessionSummary,
} from "./session-summary";
import { agentWorkspaceSettings } from "./settings";
import { createSystemPromptAssembler } from "./system-prompt";
import { createEphemeralTranscriptItemId } from "./transcript";
import { createTranscriptObserver } from "./transcript-observer";
import { createTurnStateLifecycle } from "./turn-state-lifecycle";

const MaxSessionTitleCodePoints = 4096;
const log = createLogger("agent");

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
  /** Replace the active agent slot's selected graph with an existing session. */
  switchSession(sessionId: string): Promise<SessionSummary>;
  /** Set or clear the explicit title of any durable session graph. */
  setSessionTitle(
    sessionId: string,
    title: string | null,
  ): Promise<SessionSummary>;
  /** Available models with workspace-local favorite status. */
  listModels(): Promise<ModelCatalog>;
  /** Persist a favorite update and return the refreshed available model catalog. */
  setModelFavorite(update: ModelFavoriteUpdate): Promise<ModelCatalog>;
  /** Current execution cwd plus live/default model state. */
  status(): AgentStatus;
  /**
   * Validate against pi's available models, persist as the workspace
   * default, and — when a live session exists — switch it via
   * `session.setModel`, producing native pi `model_change` state.
   */
  selectModel(ref: ModelRef): Promise<AgentStatus>;
  listAuthProviders(): Promise<ProviderAuthCatalog>;
  getCurrentProviderAuthFlow(): ProviderAuthFlowSnapshot | undefined;
  beginProviderAuthFlow(
    providerId: string,
    authType: ProviderAuthType,
  ): ProviderAuthFlowSnapshot;
  answerProviderAuthFlow(flowId: string, promptId: string, value: string): void;
  openProviderAuthLink(flowId: string, linkId: string): Promise<void>;
  cancelProviderAuthFlow(flowId: string): void;
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
  /** Durable identity for the workspace's selected session. */
  sessionSettings?: SettingsHandleFrom<typeof sessionWorkspaceSettings>;
  /** Fired whenever current agent status changes. */
  onStatusChange?: (status: AgentStatus) => void;
  /** Opens only URLs supplied by the active Pi auth provider. */
  openExternal: (url: string) => void | Promise<void>;
  /** Fired for generic provider-auth state transitions. */
  onProviderAuthFlowSnapshot: (snapshot: ProviderAuthFlowSnapshot) => void;
  /** Fired after auth changes refresh available models. */
  onModelAvailabilityChange: () => void;
}

export function createAgentDriver(opts: AgentDriverOptions): AgentDriver {
  const driverBag = new DisposableBag();
  const transcriptObserver = driverBag.add(
    createTranscriptObserver({ emit: opts.onEvent }),
  );

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

  async function getModelRuntime(): Promise<ModelRuntime> {
    return (await getServices()).modelRuntime;
  }

  const providerAuth = driverBag.add(
    createProviderAuthFlowCoordinator({
      getModelRuntime,
      openExternal: opts.openExternal,
      onSnapshot: opts.onProviderAuthFlowSnapshot,
      onAvailabilityChange: opts.onModelAvailabilityChange,
    }),
  );

  function status(): AgentStatus {
    const defaultModel = opts.agentSettings?.get("defaultModel");
    return {
      cwd: opts.workspace.agentCwd,
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
    const modelRuntime = await getModelRuntime();
    // Pick up models.json edits and freshly configured auth since the
    // runtime was created.
    await modelRuntime.refresh();
    const favorites = getFavoriteModels();
    return (await modelRuntime.getAvailable()).map((model) => ({
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
    if (selected?.sessionId === summary.sessionId) return;
    opts.sessionSettings?.set("selected", {
      sessionId: summary.sessionId,
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

  async function bindActiveSession(session: AgentSession): Promise<void> {
    transcriptObserver.bindSession(session);
    try {
      await session.bindExtensions({
        onError: (error) => {
          log.error(
            {
              extension: error.extensionPath,
              extensionEvent: error.event,
              err: error.error,
              stack: error.stack,
            },
            "extension_runtime_error",
          );
        },
      });
    } catch (error) {
      transcriptObserver.unbindSession();
      throw error;
    }

    currentModel = session.model
      ? { provider: session.model.provider, id: session.model.id }
      : undefined;
    emitStatus();
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
      transcriptObserver.instrumentSessionManager(sessionManager);
      // The first runtime consumes any services already opened by model/auth
      // UI. Replacement generations recreate Pi's cwd-bound resources.
      const sessionServices = initialRuntimeCreated
        ? await createServices(cwd, agentDir)
        : await getServices();
      const modelRuntime = sessionServices.modelRuntime;

      // The workspace default applies only when the selected branch carries no
      // native model change. Otherwise Pi restores branch-owned model state.
      let initialModel: ReturnType<ModelRuntime["getModel"]>;
      if (
        !sessionManager
          .getBranch()
          .some((entry) => entry.type === "model_change")
      ) {
        const ref = opts.agentSettings?.get("defaultModel");
        if (ref) {
          const found = modelRuntime.getModel(ref.provider, ref.id);
          if (found && modelRuntime.hasConfiguredAuth(ref.provider)) {
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
        noTools: "builtin",
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
      transcriptObserver.unbindSession();
      currentModel = undefined;
      turnStateLifecycle?.clearRestoration();
    });
    openedRuntime.setRebindSession(async (session) => {
      await bindActiveSession(session);
      await turnStateLifecycle?.restoreCurrent(session.sessionManager);
    });
    await bindActiveSession(openedRuntime.session);
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
        const modelRuntime = await getModelRuntime();
        await modelRuntime.refresh();
        if (!modelRuntime.getModel(provider, id)) {
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

    async listAuthProviders() {
      return deriveProviderAuthCatalog(await getModelRuntime());
    },

    getCurrentProviderAuthFlow: () => providerAuth.getCurrentSnapshot(),
    beginProviderAuthFlow: (providerId, authType) =>
      providerAuth.begin(providerId, authType),
    answerProviderAuthFlow: (flowId, promptId, value) =>
      providerAuth.answer(flowId, promptId, value),
    openProviderAuthLink: (flowId, linkId) =>
      providerAuth.openLink(flowId, linkId),
    cancelProviderAuthFlow: (flowId) => providerAuth.cancel(flowId),

    async selectModel(ref) {
      const modelRuntime = await getModelRuntime();
      const model = modelRuntime.getModel(ref.provider, ref.id);
      if (!model || !modelRuntime.hasConfiguredAuth(ref.provider)) {
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
          manager.getHeader()?.cwd || manager.getCwd(),
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

    async switchSession(sessionId) {
      const activeRuntime = await getRuntime();
      if (activeRuntime.session.isStreaming) {
        throw new Error("Cannot switch sessions while the agent is running");
      }

      const currentManager = activeRuntime.session.sessionManager;
      if (sessionId === currentManager.getSessionId()) {
        const session = await readSessionSummary(currentManager);
        commitSessionSelection(session);
        return session;
      }

      const sessionFile = await resolveSessionFileById(sessionDir, sessionId);
      if (!sessionFile) throw new Error(`Unknown session: ${sessionId}`);

      await turnStateLifecycle?.commit(currentManager);
      const result = await activeRuntime.switchSession(sessionFile);
      if (result.cancelled) {
        throw new Error("Session switch was cancelled");
      }
      const session = await readSessionSummary(
        activeRuntime.session.sessionManager,
      );
      commitSessionSelection(session);
      return session;
    },

    async setSessionTitle(sessionId, title) {
      const normalizedTitle = normalizeSessionTitle(title);
      const selectedManager =
        runtime?.session.sessionManager ?? (await restoreBootstrapTurnState());
      const activeRuntime = runtime;

      let manager = selectedManager;
      if (sessionId === selectedManager.getSessionId()) {
        if (activeRuntime?.session.sessionManager === selectedManager) {
          activeRuntime.session.setSessionName(normalizedTitle);
        } else {
          selectedManager.appendSessionInfo(normalizedTitle);
        }
      } else {
        const sessionFile = await resolveSessionFileById(sessionDir, sessionId);
        if (!sessionFile) throw new Error(`Unknown session: ${sessionId}`);
        const sdk = await import("@earendil-works/pi-coding-agent");
        manager = sdk.SessionManager.open(sessionFile, sessionDir);
        manager.appendSessionInfo(normalizedTitle);
      }

      return readSessionSummary(manager);
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
            id: createEphemeralTranscriptItemId("error"),
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

function normalizeSessionTitle(title: string | null): string {
  if (title === null) return "";
  const normalized = title.replace(/[\r\n]+/g, " ").trim();
  if (!normalized) {
    throw new Error("Session title cannot be blank; use null to clear it");
  }
  if (Array.from(normalized).length > MaxSessionTitleCodePoints) {
    throw new Error(
      `Session title cannot exceed ${MaxSessionTitleCodePoints} Unicode code points`,
    );
  }
  return normalized;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
