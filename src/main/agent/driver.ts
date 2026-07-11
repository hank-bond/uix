// agent driver.
//
// Wraps `createAgentSession` from `@earendil-works/pi-coding-agent` and
// normalizes pi's live event stream into the same transcript item model used
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
  AgentSessionServices,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import type {
  AgentEvent,
  AgentStatus,
  AuthProvider,
  ModelOption,
  ModelRef,
  OAuthFlowState,
  TranscriptItem,
  TranscriptSnapshot,
} from "@uix/api/agent-channels";
import type { SettingsHandle } from "@uix/api/settings";
import type { Workspace } from "../workspace";

import { join } from "node:path";

import { disposable, DisposableBag, subscribe } from "../lifecycle";
import { createLogger } from "../log";

const log = createLogger("agent");
import {
  createTurnStateCoordinator,
  submitTurnStatePrep,
  TurnStateRegistry,
} from "../turn-state/registry";

import { createOAuthFlowCoordinator } from "./auth-flow";
import { listAuthProviders as discoverAuthProviders } from "./auth-providers";
import { type AgentInstaller, createUixCoreExtension } from "./installers";
import { createTranscriptIdentity, type TranscriptIdentity } from "./identity";
import {
  buildAgentContextMessage,
  createAgentContextVocabularyInstaller,
  type AgentContextRegistry,
} from "../agent-context/registry";
import {
  extractTranscriptText,
  parseCustomTranscriptItem,
  getMessageRole,
  toIpcValue,
  toTranscriptItems,
} from "./transcript";

/**
 * The driver itself is a Disposable so callers can hand it to a Bag
 * and forget about it.
 */
export interface AgentDriver extends Disposable {
  prompt(text: string): Promise<void>;
  /** Reload pi resources if a session already exists. */
  reload(): Promise<boolean>;
  /**
   * Kick the eager, auth-free session-manager load off the boot path. Safe to
   * call before any prompt; lets history() resolve without waiting on a prompt.
   */
  init(): void;
  /** Prior transcript for renderer rehydration. Needs only the manager tier. */
  history(): Promise<TranscriptSnapshot>;
  /**
   * Where pi persists this driver's transcript. Undefined until the manager
   * is open — and, for a fresh session, until pi first persists an entry.
   */
  sessionFile(): string | undefined;
  /** Available (auth-configured) models. Answerable before any session. */
  listModels(): Promise<ModelOption[]>;
  /** Live session model (when known) plus the workspace default. */
  status(): AgentStatus;
  /**
   * Validate against pi's available models, persist as the workspace
   * default, and — when a live session exists — switch it via
   * `session.setModel`, producing native pi `model_change` state.
   */
  selectModel(ref: ModelRef): Promise<AgentStatus>;
  listAuthProviders(): Promise<AuthProvider[]>;
  currentOAuthFlow(): OAuthFlowState | undefined;
  beginOAuthFlow(providerId: string): Promise<{ flowId: string }>;
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
  /** Cockpit→agent context registry, installed by the driver. */
  agentContext?: AgentContextRegistry;
  /** State root (pins the session dir) + agent cwd. */
  workspace: Workspace;
  /**
   * Workspace `agent` settings namespace; holds the optional `defaultModel`.
   * When absent (or unset), UIX passes no model and pi's own resolution
   * applies — including resolving to no model at all when nothing is
   * authenticated.
   */
  agentSettings?: SettingsHandle;
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
  // Holds everything that needs teardown for this driver's lifetime:
  // the subscription to pi's event stream, and (once it exists) the
  // session itself.
  const bag = new DisposableBag();

  // Keyed-on-persist transcript identity: correlates live rows with the
  // durable session entry ids pi mints at append time. Created with the
  // driver, installed on the manager in openManager().
  const identity = createTranscriptIdentity();

  // The renderer shows its own optimistic pending row at submit (composer
  // state); the authoritative user row is emitted here, born keyed, when pi
  // persists the message. Same empty-text filter as history replay, so live
  // and replayed transcripts stay congruent.
  identity.onUserMessage((durableId, message) => {
    const text = extractTranscriptText(message);
    if (!text) return;
    opts.onEvent({
      type: "transcript_append",
      item: { id: durableId, kind: "user", text },
    });
  });

  // Two tiers, cached as *promises* so concurrent first-callers share one init.
  //
  //   manager — cheap, auth-free: just loads the session file. Eager (init()),
  //     off the boot path, so history() resolves fast.
  //   session — expensive: auth + model registry + the live agent. Lazy, on
  //     first prompt, so app paint never blocks on it.
  let managerPromise: Promise<SessionManager> | undefined;
  let sessionPromise: Promise<AgentSession> | undefined;

  // Resolved value of managerPromise, stashed because a settled promise can't
  // be read synchronously — and sessionFile() must be sync (it's peeked from
  // inside the wire log's describeResult, which can't await the driver).
  let openedManager: SessionManager | undefined;

  // Pi's cwd-bound services tier: auth, models, settings, and one loaded
  // resource/extension set. It starts before a session whenever model/auth
  // availability needs it, then the eventual session reuses it.
  let servicesPromise: Promise<AgentSessionServices> | undefined;

  // Live-model mirror for the sync status() read: set when a session opens,
  // updated by pi's model_select extension event, cleared on dispose.
  let liveSession: AgentSession | undefined;
  let liveModel: ModelRef | undefined;

  const agentInstallers = [...(opts.agentInstallers ?? [])];
  if (opts.turnState) {
    agentInstallers.push(createTurnStateCoordinator(opts.turnState));
  }
  if (opts.agentContext) {
    agentInstallers.push(
      createAgentContextVocabularyInstaller(opts.agentContext),
    );
  }
  agentInstallers.push((pi) => {
    pi.on("model_select", (event) => {
      liveModel = { provider: event.model.provider, id: event.model.id };
      emitStatus();
    });
  });

  function services(): Promise<AgentSessionServices> {
    return (servicesPromise ??= (async () => {
      const sdk = await import("@earendil-works/pi-coding-agent");
      return sdk.createAgentSessionServices({
        cwd: opts.workspace.agentCwd,
        agentDir: sdk.getAgentDir(),
        resourceLoaderOptions: {
          extensionFactories: [createUixCoreExtension(agentInstallers)],
        },
      });
    })().catch((err) => {
      servicesPromise = undefined;
      throw err;
    }));
  }

  async function registry(): Promise<ModelRegistry> {
    return (await services()).modelRegistry;
  }

  const oauth = bag.add(
    createOAuthFlowCoordinator({
      modelRegistry: registry,
      openExternal: opts.openExternal,
      onState: opts.onOAuthFlowState,
      onAvailabilityChange: opts.onModelAvailabilityChange,
    }),
  );

  function status(): AgentStatus {
    const defaultModel = opts.agentSettings?.get<ModelRef>("defaultModel");
    return {
      ...(liveModel && { model: liveModel }),
      ...(defaultModel && { defaultModel }),
    };
  }

  function emitStatus(): void {
    opts.onStatusChange?.(status());
  }

  // Single accessor so both tiers share one manager. On failure, clear the
  // cache so the next caller retries instead of replaying a stale rejection.
  function manager(): Promise<SessionManager> {
    return (managerPromise ??= openManager().catch((err) => {
      managerPromise = undefined;
      throw err;
    }));
  }

  async function openManager(): Promise<SessionManager> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const { stateRoot, agentCwd } = opts.workspace;
    // Pin the session dir under .uix on the stable state root, not pi's
    // cwd-derived default, so the session file stays with the canvases and does
    // not move when the agent later relocates to a worktree.
    const sessionDir = join(stateRoot, ".uix", "sessions");
    // Resume the most recent session for this cwd; create one only when none
    // exists. File-backing alone would start empty every launch — "survives
    // restart" means resume.
    let manager: SessionManager;
    try {
      manager = sdk.SessionManager.continueRecent(agentCwd, sessionDir);
    } catch {
      manager = sdk.SessionManager.create(agentCwd, sessionDir);
    }
    // Must happen before pi ever holds the manager: the append wrapper is the
    // only place durable entry ids are observable (pi persists *after* the
    // message_end listeners run and emits no post-persist event).
    identity.observe(manager);
    openedManager = manager;
    return manager;
  }

  async function openSession(): Promise<AgentSession> {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const sessionManager = await manager();
    const sessionServices = await services();
    const modelRegistry = sessionServices.modelRegistry;

    // The workspace default model applies only when the branch carries no
    // model_change of its own; otherwise pi restores the branch model. With
    // neither (or an unavailable default), pass nothing and let pi resolve —
    // its settings default, first available, or no model at all.
    let initialModel: ReturnType<ModelRegistry["find"]>;
    if (
      !sessionManager.getBranch().some((entry) => entry.type === "model_change")
    ) {
      const ref = opts.agentSettings?.get<ModelRef>("defaultModel");
      if (ref) {
        const found = modelRegistry.find(ref.provider, ref.id);
        if (found && modelRegistry.hasConfiguredAuth(found)) {
          initialModel = found;
        } else {
          log.warn({ model: ref }, "workspace_default_model_unavailable");
        }
      }
    }

    const { session } = await sdk.createAgentSessionFromServices({
      services: sessionServices,
      sessionManager,
      ...(initialModel && { model: initialModel }),
    });

    liveSession = session;
    // The model_select installer usually beat us here (pi emits it during
    // creation); this read covers the paths that don't fire it and settles
    // the no-model state.
    liveModel = session.model
      ? { provider: session.model.provider, id: session.model.id }
      : undefined;
    emitStatus();

    // Both registrations land in the bag, so a single dispose tears
    // them down in LIFO order: the subscription first, then the
    // session itself.
    bag.add(
      subscribe<AgentSessionEvent>(
        session,
        createLiveTranscriptForwarder(opts.onEvent, identity),
      ),
    );
    bag.add(disposable(() => session.dispose()));

    return session;
  }

  return {
    // Read through to the manager rather than caching at open time, so a
    // fresh session's path appears as soon as pi mints the file.
    sessionFile: () => openedManager?.getSessionFile(),

    init() {
      // Fire the eager manager load; swallow rejection here so an early failure
      // doesn't surface as an unhandled rejection. prompt()/history() retry.
      void manager().catch(() => {});
    },

    status,

    async listModels() {
      const modelRegistry = await registry();
      // Pick up models.json edits and freshly configured auth since the
      // registry was created.
      modelRegistry.refresh();
      return modelRegistry.getAvailable().map((model) => ({
        provider: model.provider,
        id: model.id,
        name: model.name,
      }));
    },

    listAuthProviders: async () => discoverAuthProviders(await registry()),
    currentOAuthFlow: () => oauth.current(),
    beginOAuthFlow: (providerId) => oauth.begin(providerId),
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
      if (liveSession) {
        // Native pi state: appends a model_change entry, persists pi's own
        // defaults, reclamps thinking. The model_select installer mirrors
        // liveModel; the extra emit below is a same-payload no-op then.
        await liveSession.setModel(model);
        liveModel = { provider: ref.provider, id: ref.id };
      }
      emitStatus();
      return status();
    },

    async history() {
      try {
        const sessionManager = await manager();
        return { items: toTranscriptItems(sessionManager.getBranch()) };
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "history_load_failed",
        );
        return { items: [] };
      }
    },

    async reload() {
      // Reload only tiers already in use. A live session owns Pi's native
      // extension rebind; before a session exists, recreate the coherent
      // services tier so extension provider registrations cannot accumulate.
      if (sessionPromise) {
        const session = await sessionPromise;
        await session.reload();
        return true;
      }
      if (!servicesPromise) return false;
      await servicesPromise;
      servicesPromise = undefined;
      await services();
      return true;
    },

    async prompt(text) {
      // No echo here: the renderer already shows its optimistic pending row,
      // and the authoritative keyed row is emitted by the onUserMessage
      // observer when pi persists. A prompt that fails before persistence
      // truthfully contributes no user row to the feed — the renderer's
      // unconfirmed row plus the error item below are the whole record.
      try {
        // If openSession rejects (e.g. missing auth), clear the cache
        // so the next prompt tries fresh instead of replaying the
        // failure forever. Failures *inside* an established session
        // surface through the event stream, not via a thrown error
        // from prompt().
        sessionPromise ??= openSession().catch((err) => {
          sessionPromise = undefined;
          throw err;
        });
        const session = await sessionPromise;

        // Submit-prep ordering: turn-state entries and the hidden uix.state
        // message must be ordered BEFORE the user message in the session tree
        // so branch navigation to the gap before a user message still has the
        // state explaining that turn.  We write both before calling
        // session.prompt(text).
        if (opts.turnState) {
          log.trace("submitting_turn_state");
          await submitTurnStatePrep(
            session.sessionManager,
            opts.workspace.agentCwd,
            opts.turnState,
          );
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
      bag[Symbol.dispose]();
      sessionPromise = undefined;
      managerPromise = undefined;
      servicesPromise = undefined;
      liveSession = undefined;
      liveModel = undefined;
    },
  };
}

function createLiveTranscriptForwarder(
  emit: (e: AgentEvent) => void,
  identity: TranscriptIdentity,
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
