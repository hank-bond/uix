// Exercises the real WorkspaceRuntime reload owner through canonical dispatch.
// Test-only spies control its existing Agent/loader collaborators. Integration
// with real feature state and handlers remains covered by runtime.test.ts.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";

import type * as AgentRuntimeModule from "./agent/workspace-agent-runtime";
import { createWorkspaceAgentRuntime } from "./agent/workspace-agent-runtime";
import type { CanonicalResponse } from "./dispatch";
import type { RuntimeEvent } from "./events";
import type * as LoaderModule from "./features/loader";
import { loadFeatures } from "./features/loader";
import { createWorkspaceRuntime } from "./runtime";
import { toWorkspaceId, type WorkspaceRuntime } from "./workspace";

vi.mock("./agent/workspace-agent-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof AgentRuntimeModule>();
  return {
    ...actual,
    createWorkspaceAgentRuntime: vi.fn(actual.createWorkspaceAgentRuntime),
  };
});

vi.mock("./features/loader", async (importOriginal) => {
  const actual = await importOriginal<typeof LoaderModule>();
  return { ...actual, loadFeatures: vi.fn(actual.loadFeatures) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const phases = ["commit", "load", "agent", "pi", "restore", "publish"] as const;
type Phase = (typeof phases)[number];

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface ReloadControls {
  order: Phase[];
  events: RuntimeEvent[];
  failures: Map<Phase, Error>;
  gates: Map<Phase, Promise<void>>;
  workspaceCleanupErrors: unknown[];
  agentCleanupErrors: unknown[];
  didCommitTurnState: boolean;
  didReloadPiResources: boolean;
}

interface Harness extends AsyncDisposable {
  controls: ReloadControls;
  runtime: WorkspaceRuntime;
  acquireReloadGuard: (label: string) => Disposable;
  reload(): Promise<CanonicalResponse>;
}

async function createHarness(): Promise<Harness> {
  await using acquisition = new AsyncDisposableStack();
  const dir = await mkdtemp(join(tmpdir(), "runtime-reload-"));
  acquisition.defer(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = join(dir, "uix.workspace.json");
  await writeFile(
    manifestPath,
    JSON.stringify({ name: "reload", features: [] }),
  );
  const runtime = acquisition.use(
    createWorkspaceRuntime({
      workspaceId: toWorkspaceId("reload"),
      workspace: { stateRoot: dir, agentCwd: dir, manifestPath },
      piAppDataDir: join(dir, ".pi"),
      apiModuleDir: join(__dirname, "../../api/src"),
      dependencies: {},
    }),
  );
  await runtime.load();
  const attachment = acquisition.use(
    (await runtime.createAttachment({ kind: "fallback" })).attachment,
  );
  const factory = vi.mocked(createWorkspaceAgentRuntime);
  const result = factory.mock.results[0];
  if (result.type !== "return")
    throw new Error("Agent runtime was not created");
  const agent = result.value;
  const { acquireReloadGuard } = factory.mock.calls[0][0];
  const controls: ReloadControls = {
    order: [],
    events: [],
    failures: new Map(),
    gates: new Map(),
    workspaceCleanupErrors: [],
    agentCleanupErrors: [],
    didCommitTurnState: true,
    didReloadPiResources: true,
  };
  const failOnce = (phase: Phase): void => {
    const failure = controls.failures.get(phase);
    controls.failures.delete(phase);
    if (failure) throw failure;
  };
  const runPhase = async (phase: Phase): Promise<void> => {
    controls.order.push(phase);
    await controls.gates.get(phase);
    failOnce(phase);
  };
  vi.spyOn(agent, "commitFeatureTurnState").mockImplementation(async () => {
    await runPhase("commit");
    return controls.didCommitTurnState;
  });
  const actualLoader =
    await vi.importActual<typeof LoaderModule>("./features/loader");
  vi.mocked(loadFeatures).mockImplementation(async (...args) => {
    await runPhase("load");
    const activation = await actualLoader.loadFeatures(...args);
    return { ...activation, cleanupErrors: controls.workspaceCleanupErrors };
  });
  vi.spyOn(agent, "reloadFeatureInstances").mockImplementation(async () => {
    await runPhase("agent");
    return controls.agentCleanupErrors;
  });
  vi.spyOn(agent, "reloadPiResources").mockImplementation(async () => {
    await runPhase("pi");
    return controls.didReloadPiResources;
  });
  vi.spyOn(agent, "restoreFeatureTurnState").mockImplementation(() =>
    runPhase("restore"),
  );
  acquisition.use(
    runtime.onEvent((event) => {
      controls.events.push(event);
      if (event.channel === "uix.surfaces_changed") {
        controls.order.push("publish");
        failOnce("publish");
      }
    }),
  );
  const lifetime = acquisition.move();
  return {
    controls,
    runtime,
    acquireReloadGuard,
    async reload(): Promise<CanonicalResponse> {
      await using prepared = attachment.prepareDispatch({
        channel: toChannelCanonicalId("uix", "reload"),
        payload: undefined,
      });
      return await prepared.invoke();
    },
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

function expectFailure(response: CanonicalResponse, message: string): void {
  expect(response).toMatchObject({
    ok: false,
    error: { code: "handler_error" },
  });
  if (response.ok) throw new Error("Reload unexpectedly succeeded");
  expect(response.error.message).toContain(message);
}

describe("WorkspaceRuntime reload", () => {
  it.each([false, true])(
    "excludes guards until restoration and publication finish (restoration fails: %s)",
    async (shouldFail) => {
      await using h = await createHarness();
      const gate = createDeferred();
      h.controls.gates.set("restore", gate.promise);
      if (shouldFail)
        h.controls.failures.set("restore", new Error("restore failed"));
      const publicationListener = vi.fn(() => {
        expect(() => h.acquireReloadGuard("publication handler")).toThrow(
          "Workspace reload is active",
        );
      });
      using _listener = h.runtime.onEvent((event) => {
        if (event.channel === "uix.surfaces_changed") publicationListener();
      });
      const reload = h.reload();
      try {
        await vi.waitFor(() => {
          expect(h.controls.order).toEqual(phases.slice(0, -1));
        });
        expect(publicationListener).not.toHaveBeenCalled();
        expect(() => h.acquireReloadGuard("Canvas writeback")).toThrow(
          "Workspace reload is active",
        );
      } finally {
        gate.resolve();
      }
      const response = await reload;
      if (shouldFail) expectFailure(response, "restore failed");
      else
        expect(response).toMatchObject({
          ok: true,
          value: { piResourcesReloaded: true },
        });
      expect(h.controls.order).toEqual(phases);
      expect(publicationListener).toHaveBeenCalledOnce();
      using _guard = h.acquireReloadGuard("after reload");
    },
  );

  it.each(phases)(
    "honors phase ordering and reopens guards and reload after %s failure",
    async (phase) => {
      await using h = await createHarness();
      h.controls.failures.set(phase, new Error(`${phase} failed`));
      expectFailure(await h.reload(), `${phase} failed`);
      expect(h.controls.order).toEqual(
        phase === "commit"
          ? ["commit"]
          : phase === "load"
            ? ["commit", "load"]
            : phases,
      );
      expect(
        h.controls.events.some(
          ({ channel }) => channel === "uix.composition_reloaded",
        ),
      ).toBe(false);

      // Failure must clear the active flag, but not bypass newly held guards.
      using guard = h.acquireReloadGuard("after failure");
      h.controls.order.length = 0;
      expectFailure(await h.reload(), "reload guard is held");
      expect(h.controls.order).toEqual([]);
      guard[Symbol.dispose]();
      await expect(h.reload()).resolves.toMatchObject({ ok: true });
      expect(h.controls.order).toEqual(phases);
    },
  );

  it("finishes replacement and publishes before reporting Workspace and Agent cleanup failures", async () => {
    await using h = await createHarness();
    h.controls.workspaceCleanupErrors.push(
      new Error("Workspace cleanup failed"),
    );
    h.controls.agentCleanupErrors.push(new Error("Agent cleanup failed"));
    expectFailure(
      await h.reload(),
      "Workspace reload completed with one or more failures",
    );
    expect(h.controls.order).toEqual(phases);
    expect(h.controls.events.map(({ channel }) => channel)).toEqual([
      "uix.surfaces_changed",
    ]);
    using guard = h.acquireReloadGuard("after cleanup failure");
    guard[Symbol.dispose]();
    h.controls.workspaceCleanupErrors.length = 0;
    h.controls.agentCleanupErrors.length = 0;
    await expect(h.reload()).resolves.toMatchObject({ ok: true });
  });

  it("continues through multiple post-activation failures and reports their aggregate", async () => {
    await using h = await createHarness();
    for (const phase of ["agent", "pi", "restore"] as const) {
      h.controls.failures.set(phase, new Error(`${phase} failed`));
    }
    expectFailure(
      await h.reload(),
      "Workspace reload completed with one or more failures",
    );
    expect(h.controls.order).toEqual(phases);
    await expect(h.reload()).resolves.toMatchObject({ ok: true });
  });

  it.each([false, true])(
    "serializes queued reloads (first reload fails: %s)",
    async (shouldFail) => {
      await using h = await createHarness();
      const gate = createDeferred();
      h.controls.gates.set("commit", gate.promise);
      if (shouldFail)
        h.controls.failures.set("load", new Error("first activation failed"));
      const first = h.reload();
      const second = h.reload();
      let hasSecondSettled = false;
      void second.then(() => {
        hasSecondSettled = true;
      });
      try {
        await vi.waitFor(() => {
          expect(h.controls.order).toEqual(["commit"]);
        });
        expect(hasSecondSettled).toBe(false);
      } finally {
        gate.resolve();
      }
      const response = await first;
      if (shouldFail) expectFailure(response, "first activation failed");
      else expect(response).toMatchObject({ ok: true });
      await expect(second).resolves.toMatchObject({ ok: true });
      expect(h.controls.order).toEqual([
        ...(shouldFail ? ["commit", "load"] : phases),
        ...phases,
      ]);
    },
  );

  it("rejects reload until every independent guard is disposed, with idempotent disposal", async () => {
    await using h = await createHarness();
    using first = h.acquireReloadGuard("first handler");
    using second = h.acquireReloadGuard("second handler");
    expectFailure(await h.reload(), "reload guard is held");
    first[Symbol.dispose]();
    first[Symbol.dispose]();
    expectFailure(await h.reload(), "reload guard is held");
    expect(h.controls.order).toEqual([]);
    second[Symbol.dispose]();
    await expect(h.reload()).resolves.toMatchObject({ ok: true });
    expect(h.controls.order).toEqual(phases);
  });

  it("still restores and publishes when the turn-state commit is skipped and Pi is not initialized", async () => {
    await using h = await createHarness();
    h.controls.didCommitTurnState = false;
    h.controls.didReloadPiResources = false;
    await expect(h.reload()).resolves.toMatchObject({
      ok: true,
      value: {
        featuresActivated: 0,
        featuresFailed: 0,
        piResourcesReloaded: false,
      },
    });
    expect(h.controls.order).toEqual(phases);
    expect(h.controls.events.map(({ channel }) => channel)).toEqual([
      "uix.surfaces_changed",
      "uix.composition_reloaded",
    ]);
  });
});
