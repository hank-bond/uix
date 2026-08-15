// The workspace agent runtime coordinates shared agent services and session-keyed agent instances.

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

import { deriveProviderAuthCatalog } from "./auth-providers";
import { deriveSelectedBranchProjection } from "./branch-projection";
import { type AgentInstaller, createUixCoreExtension } from "./installers";
import type { AgentInstance } from "./instance";
import { createAgentInstance } from "./instance";
import type { AgentInstanceState } from "./instance-state";
import {
  type AgentInstanceGuard,
  createAgentInstanceSupervisor,
} from "./instance-supervisor";
import { createProviderAuthFlowCoordinator } from "./provider-auth-flow";
import {
  type OpenedPrimarySession,
  openExistingSessionManager,
} from "./session-manager";
import {
  readRecentSessionSummaries,
  readSessionSummary,
} from "./session-summary";
import type { agentWorkspaceSettings } from "./settings";
import { createSystemPromptAssembler } from "./system-prompt";
import {
  type AgentContextRegistry,
  assembleAgentContextMessage,
  assembleAgentContextVocabularySection,
} from "../agent-context/registry";
import {
  type AgentSkillRegistry,
  createAgentSkillInstaller,
} from "../agent-skill-registry";
import {
  type AgentSystemPromptRegistry,
  assembleAgentSystemPromptSection,
} from "../agent-system-prompt-registry";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";
import type { Workspace } from "../roots";
import type { TurnStateRegistry } from "../turn-state";
import type { SessionId, SessionTarget } from "../workspace";
import { toSessionId } from "../workspace";

const MaxSessionTitleCodePoints = 4096;
const log = createLogger("agent");

export interface WorkspaceAgentRuntime {
  acquire(
    target: SessionTarget,
    openedManager?: SessionManager,
    origin?: string,
  ): Promise<AgentInstanceGuard>;
  createSession(): Promise<OpenedPrimarySession>;
  prompt(guard: AgentInstanceGuard, text: string): Promise<void>;
  readSessionHistory(
    guard: AgentInstanceGuard,
    sessionId?: string,
  ): Promise<SessionHistoryResponse>;
  listSessionSummaries(limit: number): Promise<SessionSummary[]>;
  setSessionTitle(
    guard: AgentInstanceGuard,
    sessionId: string,
    title: string | null,
  ): Promise<SessionSummary>;
  getStatus(guard: AgentInstanceGuard): AgentStatus;
  selectModel(guard: AgentInstanceGuard, ref: ModelRef): Promise<AgentStatus>;
  listModels(): Promise<ModelCatalog>;
  setModelFavorite(update: ModelFavoriteUpdate): Promise<ModelCatalog>;
  listAuthProviders(): Promise<ProviderAuthCatalog>;
  getCurrentProviderAuthFlow(): ProviderAuthFlowSnapshot | undefined;
  beginProviderAuthFlow(
    providerId: string,
    authType: ProviderAuthType,
  ): ProviderAuthFlowSnapshot;
  answerProviderAuthFlow(flowId: string, promptId: string, value: string): void;
  openProviderAuthLink(flowId: string, linkId: string): Promise<void>;
  cancelProviderAuthFlow(flowId: string): void;
  commitFeatureTurnState(): Promise<boolean>;
  restoreFeatureTurnState(): Promise<void>;
  reloadPiResources(): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface WorkspaceAgentRuntimeOptions {
  readonly workspace: Workspace;
  /** Host-owned Pi app data directory shared across workspaces. */
  readonly piAppDataDir: string;
  readonly agentInstallers?: readonly AgentInstaller[];
  readonly turnState?: TurnStateRegistry;
  readonly agentSystemPrompt?: AgentSystemPromptRegistry;
  readonly agentSkills?: AgentSkillRegistry;
  readonly agentContext?: AgentContextRegistry;
  readonly agentSettings?: SettingsHandleFrom<typeof agentWorkspaceSettings>;
  readonly onEvent: (sessionId: SessionId, event: AgentEvent) => void;
  readonly onStatusChange?: (sessionId: SessionId, status: AgentStatus) => void;
  readonly openExternal: (url: string) => void | Promise<void>;
  readonly onProviderAuthFlowSnapshot: (
    snapshot: ProviderAuthFlowSnapshot,
  ) => void;
  readonly onModelAvailabilityChange: () => void;
}

/** Creates the agent runtime for one workspace. */
export function createWorkspaceAgentRuntime(
  opts: WorkspaceAgentRuntimeOptions,
): WorkspaceAgentRuntime {
  const bag = new DisposableBag();
  const sessionDir = join(opts.workspace.stateRoot, ".uix", "sessions");
  let controlServices: AgentSessionServices | undefined;
  let inFlightControlServices: Promise<AgentSessionServices> | undefined;
  let disposal: Promise<void> | undefined;
  let disposed = false;

  async function createServices(
    installers: readonly AgentInstaller[] = [],
  ): Promise<AgentSessionServices> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    return sdk.createAgentSessionServices({
      cwd: opts.workspace.agentCwd,
      agentDir: opts.piAppDataDir,
      ...(installers.length > 0 && {
        resourceLoaderOptions: {
          extensionFactories: [createUixCoreExtension(installers)],
        },
      }),
    });
  }

  function getControlServices(): Promise<AgentSessionServices> {
    if (disposed)
      return Promise.reject(new Error("Workspace agent is disposed"));
    if (controlServices) return Promise.resolve(controlServices);
    if (inFlightControlServices) return inFlightControlServices;
    const opening = createServices()
      .then((services) => {
        if (disposed) throw new Error("Workspace agent is disposed");
        controlServices = services;
        return services;
      })
      .finally(() => {
        if (inFlightControlServices === opening) {
          inFlightControlServices = undefined;
        }
      });
    inFlightControlServices = opening;
    return opening;
  }

  const providerAuth = bag.add(
    createProviderAuthFlowCoordinator({
      getModelRuntime: async () => (await getControlServices()).modelRuntime,
      openExternal: opts.openExternal,
      onSnapshot: opts.onProviderAuthFlowSnapshot,
      onAvailabilityChange: opts.onModelAvailabilityChange,
    }),
  );

  function statusFor(state: AgentInstanceState): AgentStatus {
    const defaultModel = opts.agentSettings?.get("defaultModel");
    return {
      cwd: opts.workspace.agentCwd,
      ...(state.getCurrentModel() && { model: state.getCurrentModel() }),
      ...(defaultModel && { defaultModel }),
    };
  }

  function installersFor(state: AgentInstanceState): AgentInstaller[] {
    const installers = [...(opts.agentInstallers ?? [])];
    const systemPromptRegistry = opts.agentSystemPrompt;
    const contextRegistry = opts.agentContext;
    if (state.turnStateCoordinator) {
      installers.push(state.turnStateCoordinator.agentInstaller);
    }
    if (opts.agentSkills) {
      installers.push(createAgentSkillInstaller(opts.agentSkills));
    }
    if (systemPromptRegistry || contextRegistry) {
      installers.push(
        createSystemPromptAssembler([
          ...(systemPromptRegistry
            ? [() => assembleAgentSystemPromptSection(systemPromptRegistry)]
            : []),
          ...(contextRegistry
            ? [() => assembleAgentContextVocabularySection(contextRegistry)]
            : []),
        ]),
      );
    }
    installers.push(state.modelInstaller);
    return installers;
  }

  async function bindSession(
    target: SessionTarget,
    session: AgentSession,
    state: AgentInstanceState,
  ): Promise<void> {
    state.transcriptObserver.bindSession(session);
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
      state.transcriptObserver.unbindSession();
      throw error;
    }
    state.setCurrentModel(
      session.model
        ? { provider: session.model.provider, id: session.model.id }
        : undefined,
    );
    opts.onStatusChange?.(target.sessionId, statusFor(state));
  }

  async function createPiRuntime(
    target: SessionTarget,
    manager: SessionManager,
    state: AgentInstanceState,
  ): Promise<AgentSessionRuntime> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    await state.turnStateCoordinator?.restoreCurrent(manager);
    const installers = installersFor(state);
    const createRuntime: CreateAgentSessionRuntimeFactory = async ({
      sessionManager,
      sessionStartEvent,
    }) => {
      state.transcriptObserver.instrumentSessionManager(sessionManager);
      const services = await createServices(installers);
      const modelRuntime = services.modelRuntime;
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
        services,
        sessionManager,
        ...(sessionStartEvent && { sessionStartEvent }),
        ...(initialModel && { model: initialModel }),
        noTools: "builtin",
      });
      return { ...result, services, diagnostics: services.diagnostics };
    };

    const runtime = await sdk.createAgentSessionRuntime(createRuntime, {
      cwd: opts.workspace.agentCwd,
      agentDir: opts.piAppDataDir,
      sessionManager: manager,
    });
    runtime.setBeforeSessionInvalidate(() => {
      state.transcriptObserver.unbindSession();
      state.setCurrentModel(undefined);
      state.turnStateCoordinator?.clearRestoration();
    });
    runtime.setRebindSession(async (session) => {
      await bindSession(target, session, state);
      await state.turnStateCoordinator?.restoreCurrent(session.sessionManager);
    });
    await bindSession(target, runtime.session, state);
    return runtime;
  }

  async function createInstance(
    target: SessionTarget,
    openedManager?: SessionManager,
  ): Promise<AgentInstance> {
    const manager =
      openedManager ??
      (await openExistingSessionManager(sessionDir, target.sessionId));
    if (!manager) throw new Error(`Unknown session: ${target.sessionId}`);

    const stateRef: { current?: AgentInstanceState } = {};
    const emit = (event: AgentEvent): void => {
      opts.onEvent(target.sessionId, event);
    };
    const instance = createAgentInstance({
      target,
      manager,
      state: {
        emit,
        turnState: opts.turnState,
        cwd: opts.workspace.agentCwd,
        onCurrentModelChange: () => {
          if (stateRef.current) {
            opts.onStatusChange?.(
              target.sessionId,
              statusFor(stateRef.current),
            );
          }
        },
      },
      createRuntime: (acceptedManager, state) =>
        createPiRuntime(target, acceptedManager, state),
      commitFinalTurnState: async (acceptedManager, state) => {
        const coordinator = state.turnStateCoordinator;
        if (coordinator?.isRestorationSettled(acceptedManager)) {
          await coordinator.commit(acceptedManager);
        }
      },
    });
    stateRef.current = instance.state;
    try {
      await instance.state.turnStateCoordinator?.restoreCurrent(manager);
      return instance;
    } catch (restorationError) {
      try {
        await instance.dispose();
      } catch (disposalError) {
        throw new AggregateError(
          [restorationError, disposalError],
          "Agent instance creation and rollback failed",
          { cause: disposalError },
        );
      }
      throw restorationError;
    }
  }

  const instanceSupervisor = createAgentInstanceSupervisor({ createInstance });

  function favoriteModels(): ModelRef[] {
    return opts.agentSettings?.get("favoriteModels") ?? [];
  }

  async function listModels(): Promise<ModelCatalog> {
    const modelRuntime = (await getControlServices()).modelRuntime;
    await modelRuntime.refresh();
    const favorites = favoriteModels();
    return (await modelRuntime.getAvailable()).map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      favorite: favorites.some(
        (ref) => ref.provider === model.provider && ref.id === model.id,
      ),
    }));
  }

  async function prompt(
    operationGuard: AgentInstanceGuard,
    text: string,
  ): Promise<void> {
    const turnGuard = operationGuard.retain("turn");
    const { instance } = turnGuard;
    const { state } = instance;
    const { turnStateCoordinator } = state;
    let turn: Disposable | undefined;
    try {
      turn = instance.beginTurn();
      const session = (await instance.bootRuntime()).session;
      if (turnStateCoordinator) {
        log.trace({}, "submitting_turn_state");
        await turnStateCoordinator.commit(session.sessionManager);
      }
      if (opts.agentContext) {
        log.trace({}, "building_agent_context");
        const message = await assembleAgentContextMessage(
          session.sessionManager,
          opts.agentContext,
        );
        if (message) {
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
      await session.prompt(text);
    } catch (error) {
      opts.onEvent(instance.target.sessionId, {
        type: "transcript_append",
        item: {
          id: state.ephemeralTranscriptIds.next("error"),
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      if (turn) {
        opts.onEvent(instance.target.sessionId, { type: "agent_end" });
      }
    } finally {
      turn?.[Symbol.dispose]();
      turnGuard.release();
    }
  }

  function dispose(): Promise<void> {
    if (disposal) return disposal;
    disposal = (async () => {
      try {
        await instanceSupervisor.dispose();
      } finally {
        disposed = true;
        bag[Symbol.dispose]();
        controlServices = undefined;
        inFlightControlServices = undefined;
      }
    })();
    return disposal;
  }

  return {
    acquire(target, openedManager, origin = "attachment") {
      return instanceSupervisor.acquire(target, {
        ...(openedManager && {
          createInstance: () => createInstance(target, openedManager),
        }),
        origin,
      });
    },

    async createSession() {
      const sdk = await import("@earendil-works/pi-coding-agent");
      const manager = sdk.SessionManager.create(
        opts.workspace.agentCwd,
        sessionDir,
      );
      return {
        target: { sessionId: toSessionId(manager.getSessionId()) },
        manager,
      };
    },

    prompt,

    async readSessionHistory(guard, requestedSessionId) {
      const { instance } = guard;
      let manager = instance.manager;
      if (
        requestedSessionId !== undefined &&
        requestedSessionId !== instance.target.sessionId
      ) {
        const opened = await openExistingSessionManager(
          sessionDir,
          requestedSessionId,
        );
        if (!opened) throw new Error(`Unknown session: ${requestedSessionId}`);
        manager = opened;
      }
      return {
        session: await readSessionSummary(manager),
        transcript: deriveSelectedBranchProjection(
          manager.getBranch(),
          manager.getHeader()?.cwd || manager.getCwd(),
          instance.state.turnStateCoordinator?.toRegistrySnapshot(),
        ).transcript,
      };
    },

    listSessionSummaries: (limit) =>
      readRecentSessionSummaries(sessionDir, limit),

    async setSessionTitle(guard, sessionId, title) {
      const { instance } = guard;
      const normalized = normalizeSessionTitle(title);
      let manager = instance.manager;
      if (sessionId !== instance.target.sessionId) {
        const opened = await openExistingSessionManager(sessionDir, sessionId);
        if (!opened) throw new Error(`Unknown session: ${sessionId}`);
        manager = opened;
      }
      manager.appendSessionInfo(normalized);
      return readSessionSummary(manager);
    },

    getStatus: (guard) => statusFor(guard.instance.state),

    async selectModel(guard, ref) {
      const runtime = await guard.instance.bootRuntime();
      const modelRuntime = runtime.services.modelRuntime;
      const model = modelRuntime.getModel(ref.provider, ref.id);
      if (!model || !modelRuntime.hasConfiguredAuth(ref.provider)) {
        throw new Error(`Model is not available: ${ref.provider}/${ref.id}`);
      }
      await runtime.session.setModel(model);
      return statusFor(guard.instance.state);
    },

    listModels,

    async setModelFavorite({ provider, id, favorite }) {
      if (!opts.agentSettings) {
        throw new Error("Workspace agent settings are unavailable");
      }
      const current = favoriteModels();
      const alreadyFavorite = current.some(
        (ref) => ref.provider === provider && ref.id === id,
      );
      if (favorite && !alreadyFavorite) {
        const modelRuntime = (await getControlServices()).modelRuntime;
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
      return deriveProviderAuthCatalog(
        (await getControlServices()).modelRuntime,
      );
    },
    getCurrentProviderAuthFlow: () => providerAuth.getCurrentSnapshot(),
    beginProviderAuthFlow: (providerId, authType) =>
      providerAuth.begin(providerId, authType),
    answerProviderAuthFlow: (flowId, promptId, value) => {
      providerAuth.answer(flowId, promptId, value);
    },
    openProviderAuthLink: (flowId, linkId) =>
      providerAuth.openLink(flowId, linkId),
    cancelProviderAuthFlow: (flowId) => {
      providerAuth.cancel(flowId);
    },

    async commitFeatureTurnState() {
      let committed = true;
      await instanceSupervisor.visit(async (guard) => {
        const { instance } = guard;
        const coordinator = instance.state.turnStateCoordinator;
        if (!coordinator) return;
        if (!(await coordinator.commitIfReady(instance.manager))) {
          committed = false;
        }
      });
      return committed;
    },

    async restoreFeatureTurnState() {
      await instanceSupervisor.visit(async (guard) => {
        const { instance } = guard;
        await instance.state.turnStateCoordinator?.restoreCurrent(
          instance.manager,
        );
      });
    },

    async reloadPiResources() {
      let reloaded = false;
      await instanceSupervisor.visit(async (guard) => {
        if (await guard.instance.reloadRuntimeIfActive()) reloaded = true;
      });
      if (!controlServices && !inFlightControlServices) return reloaded;
      await getControlServices();
      controlServices = undefined;
      await getControlServices();
      return true;
    },

    dispose,
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
      `Session title cannot exceed ${String(MaxSessionTitleCodePoints)} Unicode code points`,
    );
  }
  return normalized;
}
