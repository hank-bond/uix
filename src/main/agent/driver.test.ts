// Driver model-service behavior against a mocked pi sdk: list/favorite/status/
// select before any session, workspace-default application at session open,
// and live model mirroring afterward.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Type } from "typebox";

import type { AgentStatus, ModelRef } from "@uix/api/agent-channels";
import type {
  SettingsDefinition,
  SettingsHandleFrom,
  SettingsValues,
} from "@uix/api/settings";
import {
  registerTurnStateContributions,
  TurnStateRegistry,
} from "../turn-state/registry";

import { createAgentDriver } from "./driver";
import { agentWorkspaceSettings } from "./settings";
import { sessionWorkspaceSettings } from "./session-settings";

interface FakeModel {
  provider: string;
  id: string;
  name: string;
  authed: boolean;
}

// Mutable state the mocked sdk reads at call time; tests reconfigure it via
// the returned handles below. Hoisted because vi.mock factories run before
// module-scope initializers.
const sdk = vi.hoisted(() => {
  const state = {
    models: [] as FakeModel[],
    branch: [] as Array<Record<string, unknown>>,
    replacementBranch: undefined as Array<Record<string, unknown>> | undefined,
    // Extension `on(event, handler)` registrations from the session open.
    extensionHandlers: new Map<string, (event: unknown) => void>(),
    session: undefined as Record<string, unknown> | undefined,
    runtimeCreates: 0,
    runtimeOptions: undefined as Record<string, unknown> | undefined,
    replaceRuntime: undefined as (() => Promise<void>) | undefined,
    runtimeNewSession: undefined as ReturnType<typeof vi.fn> | undefined,
    lastCreateOptions: undefined as Record<string, unknown> | undefined,
    servicesLoads: 0,
    servicesOptions: [] as Array<{ cwd: string; agentDir: string }>,
    pendingProviderModels: [] as FakeModel[],
  };

  const registry = {
    authStorage: {
      kind: "auth",
      getOAuthProviders: () => [],
      getAuthStatus: () => ({ configured: false }),
      get: () => undefined,
      set: vi.fn(),
    },
    refresh: vi.fn(),
    getAll: () => state.models,
    getAvailable: () => state.models.filter((m) => m.authed),
    getProviderDisplayName: (provider: string) => provider,
    getProviderAuthStatus: (provider: string) => ({
      configured: state.models.some(
        (model) => model.provider === provider && model.authed,
      ),
    }),
    find: (provider: string, id: string) =>
      state.models.find((m) => m.provider === provider && m.id === id),
    hasConfiguredAuth: (model: FakeModel) => model.authed,
  };

  const manager = {
    getBranch: () => state.branch,
    getSessionId: () => "session-id",
    getSessionDir: () => "/tmp/sessions",
    getSessionFile: () => "/tmp/session.jsonl",
    getHeader: () => ({ timestamp: "2026-07-19T10:00:00.000Z" }),
    getEntries: () => state.branch,
    getSessionName: () => undefined,
    appendMessage: () => "entry-id",
    appendCustomEntry: vi.fn(() => "entry-id"),
    appendCustomMessageEntry: () => "entry-id",
  };

  function makeSession(
    model: FakeModel | undefined,
    sessionManager: Record<string, unknown> = manager,
  ) {
    const unsubscribe = vi.fn();
    return {
      model,
      sessionManager,
      isStreaming: false,
      unsubscribe,
      setModel: vi.fn((next: FakeModel) => {
        (state.session as { model?: FakeModel }).model = next;
        state.extensionHandlers.get("model_select")?.({
          type: "model_select",
          model: next,
          previousModel: model,
          source: "set",
        });
      }),
      subscribe: vi.fn(() => unsubscribe),
      dispose: vi.fn(),
      prompt: vi.fn(async () => {}),
      reload: vi.fn(async () => {}),
    };
  }

  return {
    state,
    registry,
    manager,
    makeSession,
    module: {
      SessionManager: {
        continueRecent: vi.fn(() => manager),
        create: vi.fn(() => manager),
        open: vi.fn(() => manager),
      },
      createAgentSessionServices: async (options: {
        cwd: string;
        agentDir: string;
        resourceLoaderOptions: {
          extensionFactories: ((pi: unknown) => Promise<void>)[];
        };
      }) => {
        state.servicesLoads += 1;
        state.servicesOptions.push({
          cwd: options.cwd,
          agentDir: options.agentDir,
        });
        for (const model of state.pendingProviderModels) {
          const index = state.models.findIndex(
            (current) =>
              current.provider === model.provider && current.id === model.id,
          );
          if (index === -1) state.models.push(model);
          else state.models[index] = model;
        }
        const pi = {
          on: (event: string, handler: (e: unknown) => void) => {
            state.extensionHandlers.set(event, handler);
          },
        };
        for (const factory of options.resourceLoaderOptions
          .extensionFactories) {
          await factory(pi);
        }
        return {
          cwd: options.cwd,
          agentDir: options.agentDir,
          modelRegistry: registry,
          authStorage: registry.authStorage,
          resourceLoader: { reload: async () => {} },
          diagnostics: [],
        };
      },
      createAgentSessionFromServices: (options: {
        model?: FakeModel;
        sessionManager?: Record<string, unknown>;
      }) => {
        state.lastCreateOptions = options;
        // Mirror pi's resolution shape: explicit model wins, else first
        // available, else none.
        const model = options.model ?? state.models.filter((m) => m.authed)[0];
        state.session = makeSession(model, options.sessionManager);
        return Promise.resolve({ session: state.session });
      },
      createAgentSessionRuntime: async (
        createRuntime: (options: Record<string, unknown>) => Promise<{
          session: Record<string, unknown>;
          services: Record<string, unknown>;
        }>,
        options: Record<string, unknown>,
      ) => {
        state.runtimeCreates += 1;
        state.runtimeOptions = options;
        const result = await createRuntime(options);
        let rebindSession:
          | ((session: Record<string, unknown>) => Promise<void>)
          | undefined;
        let beforeSessionInvalidate: (() => void) | undefined;
        const runtime = {
          session: result.session,
          services: result.services,
          newSession: vi.fn(async () => {
            await state.replaceRuntime?.();
            return { cancelled: false };
          }),
          setRebindSession: (
            callback?: (session: Record<string, unknown>) => Promise<void>,
          ) => {
            rebindSession = callback;
          },
          setBeforeSessionInvalidate: (callback?: () => void) => {
            beforeSessionInvalidate = callback;
          },
          dispose: vi.fn(() => {
            beforeSessionInvalidate?.();
            (runtime.session.dispose as () => void)();
            return Promise.resolve();
          }),
        };
        state.runtimeNewSession = runtime.newSession;
        state.replaceRuntime = async () => {
          beforeSessionInvalidate?.();
          const replacementManager = {
            ...manager,
            getBranch: () => state.replacementBranch ?? state.branch,
            getSessionId: () => "replacement-session-id",
            getSessionFile: () => "/tmp/replacement-session.jsonl",
            getHeader: () => ({ timestamp: "2026-07-19T11:00:00.000Z" }),
          };
          const replacement = await createRuntime({
            ...options,
            sessionManager: replacementManager,
            sessionStartEvent: { type: "session_start", reason: "new" },
          });
          runtime.session = replacement.session;
          runtime.services = replacement.services;
          await rebindSession?.(replacement.session);
        };
        return runtime;
      },
    },
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => sdk.module);

const anthropic = {
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  name: "Claude Sonnet 4.5",
  authed: true,
};
const openai = {
  provider: "openai",
  id: "gpt-5",
  name: "GPT-5",
  authed: true,
};
const unauthed = {
  provider: "google",
  id: "gemini",
  name: "Gemini",
  authed: false,
};

function createFakeSettings<Definition extends SettingsDefinition>(
  _definition: Definition,
  values = new Map<string, unknown>(),
): SettingsHandleFrom<Definition> & { values: Map<string, unknown> } {
  return {
    values,
    get: (key) =>
      values.get(key) as SettingsValues<Definition>[typeof key] | undefined,
    set: (key, value) => void values.set(key, value),
    onChange: () => () => {},
  };
}

function fakeAgentSettings(initial?: ModelRef) {
  return createFakeSettings(
    agentWorkspaceSettings,
    new Map(initial ? [["defaultModel", initial]] : []),
  );
}

function fakeSessionSettings() {
  return createFakeSettings(sessionWorkspaceSettings);
}

function turnStateEntry(state: Record<string, unknown>) {
  return {
    id: "turn-state",
    parentId: undefined,
    timestamp: new Date(0).toISOString(),
    type: "custom",
    customType: "uix.turn-state",
    data: { state },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createDriver(
  settings?: SettingsHandleFrom<typeof agentWorkspaceSettings>,
  turnState?: TurnStateRegistry,
  sessionSettings?: SettingsHandleFrom<typeof sessionWorkspaceSettings>,
  workspace = {
    stateRoot: "/tmp/ws",
    agentCwd: "/tmp/ws",
    manifestPath: "/tmp/ws/uix.workspace.json",
  },
) {
  const statuses: AgentStatus[] = [];
  let availabilityChanges = 0;
  const driver = createAgentDriver({
    onEvent: (event) => {
      if (event.type === "transcript_append" && event.item.kind === "error") {
        throw new Error(`driver error event: ${event.item.message}`);
      }
    },
    workspace,
    piProfileDir: "/tmp/uix-pi-profile",
    ...(settings && { agentSettings: settings }),
    ...(turnState && { turnState }),
    ...(sessionSettings && { sessionSettings }),
    onStatusChange: (status) => statuses.push(status),
    openExternal: () => undefined,
    onOAuthFlowState: () => undefined,
    onModelAvailabilityChange: () => {
      availabilityChanges += 1;
    },
  });
  return {
    driver,
    statuses,
    get availabilityChanges() {
      return availabilityChanges;
    },
  };
}

beforeEach(() => {
  sdk.state.models = [anthropic, openai, unauthed];
  sdk.state.branch = [];
  sdk.state.replacementBranch = undefined;
  sdk.state.extensionHandlers.clear();
  sdk.state.session = undefined;
  sdk.state.runtimeCreates = 0;
  sdk.state.runtimeOptions = undefined;
  sdk.state.replaceRuntime = undefined;
  sdk.state.runtimeNewSession = undefined;
  sdk.state.lastCreateOptions = undefined;
  sdk.state.servicesLoads = 0;
  sdk.state.servicesOptions = [];
  sdk.state.pendingProviderModels = [];
  sdk.registry.authStorage.set.mockClear();
  sdk.registry.refresh.mockClear();
  sdk.module.SessionManager.continueRecent.mockClear();
  sdk.module.SessionManager.create.mockClear();
  sdk.module.SessionManager.open.mockClear();
  sdk.manager.appendCustomEntry.mockClear();
});

describe("driver model service (pre-session)", () => {
  it("lists available models only, before any session exists", async () => {
    const { driver } = createDriver();
    expect(await driver.listModels()).toEqual([
      {
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        favorite: false,
      },
      {
        provider: "openai",
        id: "gpt-5",
        name: "GPT-5",
        favorite: false,
      },
    ]);
    expect(sdk.state.session).toBeUndefined();
    expect(sdk.state.servicesLoads).toBe(1);
    expect(sdk.state.servicesOptions).toEqual([
      { cwd: "/tmp/ws", agentDir: "/tmp/uix-pi-profile" },
    ]);
  });

  it("shares one in-flight services creation across pre-runtime callers", async () => {
    const { driver } = createDriver();

    await Promise.all([driver.listModels(), driver.listAuthProviders()]);

    expect(sdk.state.servicesLoads).toBe(1);
    expect(sdk.state.session).toBeUndefined();
  });

  it("loads extension-provided models before session creation", async () => {
    sdk.state.pendingProviderModels = [
      {
        provider: "extension-provider",
        id: "extension-model",
        name: "Extension Model",
        authed: true,
      },
    ];
    const { driver } = createDriver();

    expect(await driver.listModels()).toContainEqual({
      provider: "extension-provider",
      id: "extension-model",
      name: "Extension Model",
      favorite: false,
    });
    expect(sdk.state.session).toBeUndefined();
  });

  it("decorates available models from workspace favorites", async () => {
    const settings = fakeAgentSettings();
    settings.values.set("favoriteModels", [
      { provider: "openai", id: "gpt-5" },
      { provider: "google", id: "gemini" },
    ]);
    const { driver } = createDriver(settings);

    expect(await driver.listModels()).toEqual([
      {
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        favorite: false,
      },
      {
        provider: "openai",
        id: "gpt-5",
        name: "GPT-5",
        favorite: true,
      },
    ]);
    expect(settings.values.get("favoriteModels")).toEqual([
      { provider: "openai", id: "gpt-5" },
      { provider: "google", id: "gemini" },
    ]);
  });

  it("adds and removes favorites idempotently", async () => {
    const settings = fakeAgentSettings();
    const { driver } = createDriver(settings);
    const update = {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      favorite: true,
    };

    await driver.setModelFavorite(update);
    const models = await driver.setModelFavorite(update);

    expect(settings.values.get("favoriteModels")).toEqual([
      { provider: "anthropic", id: "claude-sonnet-4-5" },
    ]);
    expect(models[0]?.favorite).toBe(true);

    await driver.setModelFavorite({ ...update, favorite: false });
    await driver.setModelFavorite({ ...update, favorite: false });
    expect(settings.values.get("favoriteModels")).toEqual([]);
  });

  it("rejects adding an unknown model without changing favorites", async () => {
    const settings = fakeAgentSettings();
    const { driver } = createDriver(settings);

    await expect(
      driver.setModelFavorite({
        provider: "missing",
        id: "unknown",
        favorite: true,
      }),
    ).rejects.toThrow("Unknown model");
    expect(settings.values.has("favoriteModels")).toBe(false);
  });

  it("does not initialize services on reload until they have been used", async () => {
    const { driver } = createDriver();

    await expect(driver.reloadPiResources()).resolves.toBe(false);
    expect(sdk.state.servicesLoads).toBe(0);

    await driver.listModels();
    await expect(driver.reloadPiResources()).resolves.toBe(true);
    expect(sdk.state.servicesLoads).toBe(2);
    expect(sdk.state.servicesOptions).toEqual([
      { cwd: "/tmp/ws", agentDir: "/tmp/uix-pi-profile" },
      { cwd: "/tmp/ws", agentDir: "/tmp/uix-pi-profile" },
    ]);
    expect(sdk.state.session).toBeUndefined();
  });

  it("reports empty status with no session and no workspace default", () => {
    const { driver } = createDriver(fakeAgentSettings());
    expect(driver.status()).toEqual({});
  });

  it("reports the workspace default before a session exists", () => {
    const ref = { provider: "openai", id: "gpt-5" };
    const { driver } = createDriver(fakeAgentSettings(ref));
    expect(driver.status()).toEqual({ defaultModel: ref });
  });

  it("selectModel before a session writes the default only and notifies", async () => {
    const settings = fakeAgentSettings();
    const { driver, statuses } = createDriver(settings);
    const ref = { provider: "anthropic", id: "claude-sonnet-4-5" };

    const status = await driver.selectModel(ref);

    expect(status).toEqual({ defaultModel: ref });
    expect(settings.values.get("defaultModel")).toEqual(ref);
    expect(statuses).toEqual([{ defaultModel: ref }]);
    expect(sdk.state.session).toBeUndefined();
  });

  it("selectModel rejects unavailable models without touching settings", async () => {
    const settings = fakeAgentSettings();
    const { driver } = createDriver(settings);

    await expect(
      driver.selectModel({ provider: "google", id: "gemini" }),
    ).rejects.toThrow("not available");
    await expect(
      driver.selectModel({ provider: "nope", id: "missing" }),
    ).rejects.toThrow("not available");
    expect(settings.values.size).toBe(0);
  });
});

describe("driver provider credentials (pre-session)", () => {
  it("saves an offered API key, refreshes models, and notifies", async () => {
    const result = createDriver();

    await result.driver.saveProviderCredentials({
      providerId: "google",
      methodId: "api-key",
      values: { apiKey: "  secret-key  " },
    });

    expect(sdk.registry.authStorage.set).toHaveBeenCalledWith("google", {
      type: "api_key",
      key: "  secret-key  ",
    });
    expect(sdk.registry.refresh).toHaveBeenCalledOnce();
    expect(result.availabilityChanges).toBe(1);
    expect(sdk.state.session).toBeUndefined();
  });

  it("rejects methods that are not offered", async () => {
    const { driver } = createDriver();

    await expect(
      driver.saveProviderCredentials({
        providerId: "missing",
        methodId: "api-key",
        values: { apiKey: "secret-key" },
      }),
    ).rejects.toThrow("not currently offered");
    expect(sdk.registry.authStorage.set).not.toHaveBeenCalled();
    expect(sdk.registry.refresh).not.toHaveBeenCalled();
  });

  it("rejects empty required fields", async () => {
    const { driver } = createDriver();

    await expect(
      driver.saveProviderCredentials({
        providerId: "google",
        methodId: "api-key",
        values: { apiKey: "   " },
      }),
    ).rejects.toThrow("Credential field is required: apiKey");
    expect(sdk.registry.authStorage.set).not.toHaveBeenCalled();
    expect(sdk.registry.refresh).not.toHaveBeenCalled();
  });
});

describe("driver selected-session activation", () => {
  it("opens the persisted selection and reconciles its cached label", async () => {
    const root = await mkdtemp(join(tmpdir(), "uix-driver-session-"));
    try {
      const sessionDir = join(root, ".uix", "sessions");
      const selectedFile = join(
        sessionDir,
        "2026-07-19T10-00-00-000Z_session-id.jsonl",
      );
      await mkdir(sessionDir, { recursive: true });
      await writeFile(selectedFile, "");
      const sessionSettings = fakeSessionSettings();
      sessionSettings.set("selected", {
        sessionId: "session-id",
        displayLabel: "Stale label",
      });
      const { driver } = createDriver(undefined, undefined, sessionSettings, {
        stateRoot: root,
        agentCwd: root,
        manifestPath: join(root, "uix.workspace.json"),
      });

      driver.init();
      await driver.sessionHistory();

      expect(sdk.module.SessionManager.open).toHaveBeenCalledWith(
        selectedFile,
        sessionDir,
      );
      expect(sdk.module.SessionManager.continueRecent).not.toHaveBeenCalled();
      expect(sessionSettings.values.get("selected")).toEqual({
        sessionId: "session-id",
        displayLabel: "New conversation",
      });
      expect(sdk.state.servicesLoads).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to the newest session when the persisted selection is stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "uix-driver-session-"));
    try {
      const sessionSettings = fakeSessionSettings();
      sessionSettings.set("selected", {
        sessionId: "missing-session",
        displayLabel: "Missing conversation",
      });
      const { driver } = createDriver(undefined, undefined, sessionSettings, {
        stateRoot: root,
        agentCwd: root,
        manifestPath: join(root, "uix.workspace.json"),
      });

      await driver.sessionHistory();

      expect(sdk.module.SessionManager.open).not.toHaveBeenCalled();
      expect(sdk.module.SessionManager.continueRecent).toHaveBeenCalledWith(
        root,
        join(root, ".uix", "sessions"),
      );
      expect(sessionSettings.values.get("selected")).toEqual({
        sessionId: "session-id",
        displayLabel: "New conversation",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads the selected transcript and authoritative summary without opening Pi services", async () => {
    sdk.state.branch = [
      {
        id: "user-1",
        parentId: null,
        timestamp: "2026-07-19T10:05:00.000Z",
        type: "message",
        message: { role: "user", content: "  first   question  " },
      },
    ];
    const { driver } = createDriver();

    await expect(driver.sessionHistory()).resolves.toEqual({
      session: {
        sessionId: "session-id",
        displayLabel: "first question",
        createdAt: "2026-07-19T10:00:00.000Z",
        modifiedAt: "2026-07-19T10:00:00.000Z",
      },
      transcript: {
        items: [{ id: "user-1", kind: "user", text: "first   question" }],
      },
    });
    expect(sdk.state.servicesLoads).toBe(0);
    expect(sdk.state.runtimeCreates).toBe(0);
  });

  it("restores startup turn state without opening Pi services or a runtime", async () => {
    const turnState = new TurnStateRegistry();
    const restore = vi.fn();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    driver.init();

    await vi.waitFor(() => {
      expect(restore).toHaveBeenCalledWith("persisted");
    });
    await driver.sessionHistory();
    expect(restore).toHaveBeenCalledOnce();
    expect(sdk.state.servicesLoads).toBe(0);
    expect(sdk.state.runtimeCreates).toBe(0);
    expect(sdk.state.session).toBeUndefined();
  });

  it("commits active feature turn state after bootstrap restoration settles", async () => {
    const turnState = new TurnStateRegistry();
    const createSnapshot = vi.fn(() => "live");
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot,
        restore: () => undefined,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    driver.init();
    await driver.sessionHistory();

    await expect(driver.commitFeatureTurnState()).resolves.toBe(true);
    expect(createSnapshot).toHaveBeenCalledOnce();
    expect(sdk.manager.appendCustomEntry).toHaveBeenCalledWith(
      "uix.turn-state",
      {
        cwd: "/tmp/ws",
        state: { "canvas.documents": "live" },
      },
    );
  });

  it("skips active feature commit without waiting for bootstrap restoration", async () => {
    const turnState = new TurnStateRegistry();
    const restoreGate = deferred();
    const createSnapshot = vi.fn(() => "live");
    const restore = vi.fn(async () => restoreGate.promise);
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot,
        restore,
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    driver.init();
    await vi.waitFor(() => {
      expect(restore).toHaveBeenCalledOnce();
    });

    await expect(driver.commitFeatureTurnState()).resolves.toBe(false);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(sdk.manager.appendCustomEntry).not.toHaveBeenCalled();

    restoreGate.resolve();
    await driver.sessionHistory();
  });

  it("propagates an active feature snapshot failure after restoration settles", async () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => {
          throw new Error("snapshot failed");
        },
        restore: () => undefined,
      },
    });
    const { driver } = createDriver(undefined, turnState);

    driver.init();
    await driver.sessionHistory();

    await expect(driver.commitFeatureTurnState()).rejects.toThrow(
      "snapshot failed",
    );
    expect(sdk.manager.appendCustomEntry).not.toHaveBeenCalled();
  });

  it("ignores an obsolete bootstrap registry snapshot and restores replacement instances once", async () => {
    const turnState = new TurnStateRegistry();
    const restorePreviousInstance = vi.fn();
    const previousRegistration = registerTurnStateContributions(
      turnState,
      "canvas",
      {
        documents: {
          schema: Type.String(),
          createSnapshot: () => "previous-live",
          restore: restorePreviousInstance,
        },
      },
    );
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    driver.init();
    previousRegistration[Symbol.dispose]();
    const restoreReplacementInstance = vi.fn();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "replacement-live",
        restore: restoreReplacementInstance,
      },
    });

    await driver.restoreFeatureTurnState();
    await driver.sessionHistory();

    expect(restorePreviousInstance).not.toHaveBeenCalled();
    expect(restoreReplacementInstance).toHaveBeenCalledOnce();
    expect(restoreReplacementInstance).toHaveBeenCalledWith("persisted");
  });

  it("restores replacement instances without waiting for an obsolete callback", async () => {
    const turnState = new TurnStateRegistry();
    const previousRestoreGate = deferred();
    const restorePreviousInstance = vi.fn(
      async () => previousRestoreGate.promise,
    );
    const previousRegistration = registerTurnStateContributions(
      turnState,
      "canvas",
      {
        documents: {
          schema: Type.String(),
          createSnapshot: () => "previous-live",
          restore: restorePreviousInstance,
        },
      },
    );
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    driver.init();
    await vi.waitFor(() => {
      expect(restorePreviousInstance).toHaveBeenCalledOnce();
    });
    await expect(driver.commitFeatureTurnState()).resolves.toBe(false);

    previousRegistration[Symbol.dispose]();
    const restoreReplacementInstance = vi.fn();
    const createReplacementSnapshot = vi.fn(() => "replacement-live");
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: createReplacementSnapshot,
        restore: restoreReplacementInstance,
      },
    });

    await driver.restoreFeatureTurnState();
    expect(restoreReplacementInstance).toHaveBeenCalledWith("persisted");
    await expect(driver.commitFeatureTurnState()).resolves.toBe(true);
    expect(createReplacementSnapshot).toHaveBeenCalledOnce();

    previousRestoreGate.resolve();
    await driver.sessionHistory();
    expect(restoreReplacementInstance).toHaveBeenCalledOnce();
  });

  it("waits for startup restoration before creating the runtime", async () => {
    const turnState = new TurnStateRegistry();
    const restoreGate = deferred();
    const restored: unknown[] = [];
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "live",
        restore: async (value) => {
          restored.push(value);
          await restoreGate.promise;
        },
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);

    const prompting = driver.prompt("hello");
    await vi.waitFor(() => {
      expect(restored).toEqual(["persisted"]);
    });
    expect(sdk.state.runtimeCreates).toBe(0);

    restoreGate.resolve();
    await prompting;
    expect(sdk.state.runtimeCreates).toBe(1);
  });

  it("restores an empty replacement session before rebind completes", async () => {
    const turnState = new TurnStateRegistry();
    const emptyRestoreGate = deferred();
    const restored: unknown[] = [];
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => "persisted",
        restore: async (value) => {
          restored.push(value);
          if (value === undefined) await emptyRestoreGate.promise;
        },
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "persisted" })];
    const { driver } = createDriver(undefined, turnState);
    await driver.prompt("hello");
    sdk.state.replacementBranch = [];

    const replaceRuntime = sdk.state.replaceRuntime;
    if (!replaceRuntime) throw new Error("Replacement runtime is unavailable");
    const replacement = replaceRuntime();
    await vi.waitFor(() => {
      expect(restored).toEqual(["persisted", undefined]);
    });

    let completed = false;
    void replacement.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    emptyRestoreGate.resolve();
    await replacement;
    expect(completed).toBe(true);
  });

  it("commits current state and returns the fresh session only after restoration", async () => {
    const turnState = new TurnStateRegistry();
    const emptyRestoreGate = deferred();
    const events: string[] = [];
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => {
          events.push("snapshot");
          return "current";
        },
        restore: async (value) => {
          events.push(value === undefined ? "restore:empty" : "restore:saved");
          if (value === undefined) await emptyRestoreGate.promise;
        },
      },
    });
    sdk.state.branch = [turnStateEntry({ "canvas.documents": "saved" })];
    sdk.state.replacementBranch = [];
    const sessionSettings = fakeSessionSettings();
    const { driver } = createDriver(undefined, turnState, sessionSettings);

    const transition = driver.newSession();
    await vi.waitFor(() => {
      expect(events).toEqual(["restore:saved", "snapshot", "restore:empty"]);
    });
    expect(sdk.manager.appendCustomEntry).toHaveBeenCalledWith(
      "uix.turn-state",
      {
        cwd: "/tmp/ws",
        state: { "canvas.documents": "current" },
      },
    );

    let completed = false;
    void transition.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    emptyRestoreGate.resolve();
    await expect(transition).resolves.toEqual({
      sessionId: "replacement-session-id",
      displayLabel: "New conversation",
      createdAt: "2026-07-19T11:00:00.000Z",
      modifiedAt: "2026-07-19T11:00:00.000Z",
    });
    expect(completed).toBe(true);
    expect(sdk.state.runtimeNewSession).toHaveBeenCalledOnce();
    expect(sessionSettings.values.get("selected")).toEqual({
      sessionId: "replacement-session-id",
      displayLabel: "New conversation",
    });
  });

  it("does not replace the session when the current-state commit fails", async () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.String(),
        createSnapshot: () => {
          throw new Error("snapshot failed");
        },
        restore: () => undefined,
      },
    });
    const { driver } = createDriver(undefined, turnState);

    await expect(driver.newSession()).rejects.toThrow("snapshot failed");
    expect(sdk.state.runtimeNewSession).not.toHaveBeenCalled();
  });

  it("rejects New Session while the agent is running", async () => {
    const { driver } = createDriver();
    await driver.prompt("hello");
    const session = sdk.state.session as { isStreaming: boolean };
    session.isStreaming = true;

    await expect(driver.newSession()).rejects.toThrow(
      "Cannot create a new session while the agent is running",
    );
    expect(sdk.state.runtimeNewSession).not.toHaveBeenCalled();
  });
});

describe("driver model service (session open)", () => {
  it("shares one in-flight runtime open across concurrent first prompts", async () => {
    const { driver } = createDriver();

    await Promise.all([driver.prompt("one"), driver.prompt("two")]);

    expect(sdk.state.runtimeCreates).toBe(1);
    expect(sdk.state.servicesLoads).toBe(1);
  });

  it("passes the workspace default to session creation when the branch has no model_change", async () => {
    const { driver, statuses } = createDriver(
      fakeAgentSettings({ provider: "openai", id: "gpt-5" }),
    );

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toEqual(openai);
    expect(sdk.state.servicesLoads).toBe(1);
    expect(sdk.state.servicesOptions).toEqual([
      { cwd: "/tmp/ws", agentDir: "/tmp/uix-pi-profile" },
    ]);
    expect(sdk.state.runtimeCreates).toBe(1);
    expect(sdk.state.runtimeOptions).toMatchObject({
      cwd: "/tmp/ws",
      agentDir: "/tmp/uix-pi-profile",
      sessionManager: sdk.manager,
    });
    expect(driver.status()).toEqual({
      model: { provider: "openai", id: "gpt-5" },
      defaultModel: { provider: "openai", id: "gpt-5" },
    });
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("lets pi restore the branch model when a model_change entry exists", async () => {
    const { driver } = createDriver(
      fakeAgentSettings({ provider: "openai", id: "gpt-5" }),
    );
    sdk.state.branch = [{ type: "model_change" }];

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toBeUndefined();
  });

  it("passes no model when the workspace default is unavailable", async () => {
    const { driver } = createDriver(
      fakeAgentSettings({ provider: "google", id: "gemini" }),
    );

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toBeUndefined();
  });

  it("reports no live model when pi resolves none", async () => {
    sdk.state.models = [unauthed];
    const { driver } = createDriver(fakeAgentSettings());

    await driver.prompt("hi");

    expect(driver.status()).toEqual({});
  });
});

describe("driver model service (live session)", () => {
  it("rebinds driver-owned state to a replacement runtime generation", async () => {
    const { driver } = createDriver(fakeAgentSettings());
    await driver.prompt("hi");
    const firstSession = sdk.state.session as {
      unsubscribe: ReturnType<typeof vi.fn>;
    };

    await sdk.state.replaceRuntime?.();

    expect(firstSession.unsubscribe).toHaveBeenCalledOnce();
    expect(sdk.state.servicesLoads).toBe(2);
    expect(sdk.state.session).not.toBe(firstSession);

    await driver.selectModel({ provider: "openai", id: "gpt-5" });
    const replacementSession = sdk.state.session as {
      setModel: ReturnType<typeof vi.fn>;
    };
    expect(replacementSession.setModel).toHaveBeenCalledWith(openai);
  });

  it("reloads the live session without replacing its profiled services", async () => {
    const { driver } = createDriver();
    await driver.prompt("hi");

    await expect(driver.reloadPiResources()).resolves.toBe(true);

    const session = sdk.state.session as { reload: ReturnType<typeof vi.fn> };
    expect(session.reload).toHaveBeenCalledOnce();
    expect(sdk.state.servicesLoads).toBe(1);
    expect(sdk.state.servicesOptions).toEqual([
      { cwd: "/tmp/ws", agentDir: "/tmp/uix-pi-profile" },
    ]);
  });

  it("selectModel switches the live session via setModel", async () => {
    const settings = fakeAgentSettings();
    const { driver } = createDriver(settings);
    await driver.prompt("hi");

    const ref = { provider: "openai", id: "gpt-5" };
    const status = await driver.selectModel(ref);

    const session = sdk.state.session as { setModel: ReturnType<typeof vi.fn> };
    expect(session.setModel).toHaveBeenCalledWith(openai);
    expect(settings.values.get("defaultModel")).toEqual(ref);
    expect(status).toEqual({ model: ref, defaultModel: ref });
  });

  it("mirrors pi-initiated model changes into status", async () => {
    const { driver, statuses } = createDriver(fakeAgentSettings());
    await driver.prompt("hi");
    statuses.length = 0;

    sdk.state.extensionHandlers.get("model_select")?.({
      type: "model_select",
      model: openai,
      previousModel: anthropic,
      source: "cycle",
    });

    expect(driver.status()).toEqual({
      model: { provider: "openai", id: "gpt-5" },
    });
    expect(statuses).toEqual([{ model: { provider: "openai", id: "gpt-5" } }]);
  });
});
