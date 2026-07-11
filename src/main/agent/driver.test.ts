// Driver model-service behavior (plan: agent-controls A1) against a mocked
// pi sdk: list/status/select before any session, workspace-default
// application at session open, and live model mirroring afterward.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentStatus, ModelRef } from "@uix/api/agent-channels";
import type { SettingsHandle } from "@uix/api/settings";

import { createAgentDriver } from "./driver";

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
    branch: [] as { type: string }[],
    // Extension `on(event, handler)` registrations from the session open.
    extensionHandlers: new Map<string, (event: unknown) => void>(),
    session: undefined as Record<string, unknown> | undefined,
    lastCreateOptions: undefined as Record<string, unknown> | undefined,
    servicesLoads: 0,
    pendingProviderModels: [] as FakeModel[],
  };

  const registry = {
    authStorage: { kind: "auth" },
    refresh: () => {},
    getAll: () => state.models,
    getAvailable: () => state.models.filter((m) => m.authed),
    find: (provider: string, id: string) =>
      state.models.find((m) => m.provider === provider && m.id === id),
    hasConfiguredAuth: (model: FakeModel) => model.authed,
  };

  const manager = {
    getBranch: () => state.branch,
    getSessionFile: () => "/tmp/session.jsonl",
    appendMessage: () => "entry-id",
    appendCustomMessageEntry: () => "entry-id",
  };

  function makeSession(model: FakeModel | undefined) {
    return {
      model,
      setModel: vi.fn((next: FakeModel) => {
        (state.session as { model?: FakeModel }).model = next;
        state.extensionHandlers.get("model_select")?.({
          type: "model_select",
          model: next,
          previousModel: model,
          source: "set",
        });
      }),
      subscribe: () => () => {},
      dispose: () => {},
      prompt: vi.fn(async () => {}),
      reload: async () => {},
    };
  }

  return {
    state,
    registry,
    manager,
    makeSession,
    module: {
      SessionManager: {
        continueRecent: () => manager,
        create: () => manager,
      },
      getAgentDir: () => "/tmp/pi-agent",
      createAgentSessionServices: async (options: {
        resourceLoaderOptions: {
          extensionFactories: ((pi: unknown) => Promise<void>)[];
        };
      }) => {
        state.servicesLoads += 1;
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
          modelRegistry: registry,
          authStorage: registry.authStorage,
          resourceLoader: { reload: async () => {} },
        };
      },
      createAgentSessionFromServices: (options: { model?: FakeModel }) => {
        state.lastCreateOptions = options;
        // Mirror pi's resolution shape: explicit model wins, else first
        // available, else none.
        const model = options.model ?? state.models.filter((m) => m.authed)[0];
        state.session = makeSession(model);
        return Promise.resolve({ session: state.session });
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

function fakeSettings(initial?: ModelRef): SettingsHandle & {
  values: Map<string, unknown>;
} {
  const values = new Map<string, unknown>(
    initial ? [["defaultModel", initial]] : [],
  );
  return {
    values,
    get: <T>(key: string) => values.get(key) as T | undefined,
    set: (key, value) => void values.set(key, value),
    onChange: () => () => {},
  };
}

function createDriver(settings?: SettingsHandle) {
  const statuses: AgentStatus[] = [];
  const driver = createAgentDriver({
    onEvent: (event) => {
      if (event.type === "transcript_append" && event.item.kind === "error") {
        throw new Error(`driver error event: ${event.item.message}`);
      }
    },
    workspace: {
      stateRoot: "/tmp/ws",
      agentCwd: "/tmp/ws",
      manifestPath: "/tmp/ws/uix.workspace.json",
    },
    ...(settings && { agentSettings: settings }),
    onStatusChange: (status) => statuses.push(status),
  });
  return { driver, statuses };
}

beforeEach(() => {
  sdk.state.models = [anthropic, openai, unauthed];
  sdk.state.branch = [];
  sdk.state.extensionHandlers.clear();
  sdk.state.session = undefined;
  sdk.state.lastCreateOptions = undefined;
  sdk.state.servicesLoads = 0;
  sdk.state.pendingProviderModels = [];
});

describe("driver model service (pre-session)", () => {
  it("lists available models only, before any session exists", async () => {
    const { driver } = createDriver();
    expect(await driver.listModels()).toEqual([
      {
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
      },
      { provider: "openai", id: "gpt-5", name: "GPT-5" },
    ]);
    expect(sdk.state.session).toBeUndefined();
    expect(sdk.state.servicesLoads).toBe(1);
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
    });
    expect(sdk.state.session).toBeUndefined();
  });

  it("does not initialize services on reload until they have been used", async () => {
    const { driver } = createDriver();

    await expect(driver.reload()).resolves.toBe(false);
    expect(sdk.state.servicesLoads).toBe(0);

    await driver.listModels();
    await expect(driver.reload()).resolves.toBe(true);
    expect(sdk.state.servicesLoads).toBe(2);
    expect(sdk.state.session).toBeUndefined();
  });

  it("reports empty status with no session and no workspace default", () => {
    const { driver } = createDriver(fakeSettings());
    expect(driver.status()).toEqual({});
  });

  it("reports the workspace default before a session exists", () => {
    const ref = { provider: "openai", id: "gpt-5" };
    const { driver } = createDriver(fakeSettings(ref));
    expect(driver.status()).toEqual({ defaultModel: ref });
  });

  it("selectModel before a session writes the default only and notifies", async () => {
    const settings = fakeSettings();
    const { driver, statuses } = createDriver(settings);
    const ref = { provider: "anthropic", id: "claude-sonnet-4-5" };

    const status = await driver.selectModel(ref);

    expect(status).toEqual({ defaultModel: ref });
    expect(settings.values.get("defaultModel")).toEqual(ref);
    expect(statuses).toEqual([{ defaultModel: ref }]);
    expect(sdk.state.session).toBeUndefined();
  });

  it("selectModel rejects unavailable models without touching settings", async () => {
    const settings = fakeSettings();
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

describe("driver model service (session open)", () => {
  it("passes the workspace default to session creation when the branch has no model_change", async () => {
    const { driver, statuses } = createDriver(
      fakeSettings({ provider: "openai", id: "gpt-5" }),
    );

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toEqual(openai);
    expect(sdk.state.servicesLoads).toBe(1);
    expect(driver.status()).toEqual({
      model: { provider: "openai", id: "gpt-5" },
      defaultModel: { provider: "openai", id: "gpt-5" },
    });
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("lets pi restore the branch model when a model_change entry exists", async () => {
    const { driver } = createDriver(
      fakeSettings({ provider: "openai", id: "gpt-5" }),
    );
    sdk.state.branch = [{ type: "model_change" }];

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toBeUndefined();
  });

  it("passes no model when the workspace default is unavailable", async () => {
    const { driver } = createDriver(
      fakeSettings({ provider: "google", id: "gemini" }),
    );

    await driver.prompt("hi");

    expect(sdk.state.lastCreateOptions?.["model"]).toBeUndefined();
  });

  it("reports no live model when pi resolves none", async () => {
    sdk.state.models = [unauthed];
    const { driver } = createDriver(fakeSettings());

    await driver.prompt("hi");

    expect(driver.status()).toEqual({});
  });
});

describe("driver model service (live session)", () => {
  it("selectModel switches the live session via setModel", async () => {
    const settings = fakeSettings();
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
    const { driver, statuses } = createDriver(fakeSettings());
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
