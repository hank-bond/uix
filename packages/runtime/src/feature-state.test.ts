import { describe, expect, it, vi } from "vitest";

import type {
  AgentFeatureStateBuilder,
  WorkspaceFeatureStateBuilder,
} from "@uix/api/feature-state";

import { createFeatureStateOwnership } from "./feature-state";

interface UnsafeBuilder {
  add(extension: unknown): UnsafeBuilder;
}

interface RollbackCase {
  readonly name: string;
  readonly expected: readonly string[];
  readonly run: (
    state: WorkspaceFeatureStateBuilder<{ readonly settings: object }>,
    order: string[],
  ) => void;
}

const asUnsafe = (builder: object): UnsafeBuilder =>
  builder as unknown as UnsafeBuilder;

const syncLifetime = (name: string, order: string[]): Disposable => ({
  [Symbol.dispose]() {
    order.push(name);
  },
});

const asyncLifetime = (name: string, order: string[]): AsyncDisposable => ({
  async [Symbol.asyncDispose]() {
    await Promise.resolve();
    order.push(name);
  },
});

const rollbackCases: readonly RollbackCase[] = [
  {
    name: "a substrate collision",
    expected: ["incoming", "accepted"],
    run: (state, order): void => {
      const widened = state.add({ accepted: syncLifetime("accepted", order) });
      asUnsafe(widened).add({
        settings: asyncLifetime("incoming", order),
      });
    },
  },
  {
    name: "a duplicate addition",
    expected: ["incoming", "accepted"],
    run: (state, order): void => {
      const widened = state.add({ cache: syncLifetime("accepted", order) });
      asUnsafe(widened).add({ cache: syncLifetime("incoming", order) });
    },
  },
  {
    name: "a multi-field addition",
    expected: ["incoming-b", "incoming-a", "accepted"],
    run: (state, order): void => {
      const widened = state.add({ accepted: syncLifetime("accepted", order) });
      asUnsafe(widened).add({
        first: syncLifetime("incoming-a", order),
        second: asyncLifetime("incoming-b", order),
      });
    },
  },
  {
    name: "a later factory throw",
    expected: ["second", "first"],
    run: (state, order): void => {
      state
        .add({ first: syncLifetime("first", order) })
        .add({ second: asyncLifetime("second", order) });
      throw new Error("factory failed");
    },
  },
];

describe("createFeatureStateOwnership", () => {
  it("finalizes a shallow copy of the substrate base when no state factory exists", async () => {
    const settings = { enabled: true };
    const base = { settings };
    const candidate = await createFeatureStateOwnership({
      lane: "agent",
      base,
    });

    expect(candidate.state).not.toBe(base);
    expect(candidate.state.settings).toBe(settings);
    expect(candidate.state).toEqual({ settings: { enabled: true } });
    expect(Object.isFrozen(candidate.state)).toBe(true);
    await candidate[Symbol.asyncDispose]();
  });

  it("finalizes a shallow-frozen state without builder authority", async () => {
    const candidate = await createFeatureStateOwnership({
      lane: "workspace",
      base: {
        settings: { enabled: true },
        log: { info: vi.fn() },
      },
      build: (state) =>
        state.add({ cache: new Map<string, string>() }).add({ count: 0 }),
    });

    expect(candidate.state).toMatchObject({ count: 0 });
    expect(Object.isFrozen(candidate.state)).toBe(true);
    expect(Object.isFrozen(candidate.state.settings)).toBe(false);
    expect("add" in candidate.state).toBe(false);
    expect(Reflect.set(candidate.state, "count", 1)).toBe(false);

    candidate.state.settings.enabled = false;
    expect(candidate.state.settings.enabled).toBe(false);

    await candidate[Symbol.asyncDispose]();
  });

  it("owns successful mixed-protocol additions in exact reverse order", async () => {
    const order: string[] = [];
    const candidate = await createFeatureStateOwnership({
      lane: "agent",
      base: { settings: { enabled: true } },
      build: (state) =>
        state
          .add({ first: syncLifetime("first", order) })
          .add({ second: asyncLifetime("second", order) })
          .add({ third: syncLifetime("third", order) }),
    });

    await candidate[Symbol.asyncDispose]();
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("diagnoses substrate and prior-addition collisions", async () => {
    await expect(
      createFeatureStateOwnership({
        lane: "workspace",
        base: { settings: {} },
        build: (state) => {
          asUnsafe(state).add({ settings: {} });
          return state;
        },
      }),
    ).rejects.toThrow(
      'Workspace feature state member "settings" collides with substrate base state',
    );

    await expect(
      createFeatureStateOwnership({
        lane: "agent",
        base: { settings: {} },
        build: (state) => {
          const widened = state.add({ cache: {} });
          asUnsafe(widened).add({ cache: {} });
          return widened;
        },
      }),
    ).rejects.toThrow('Agent feature state member "cache" was already added');
  });

  it.each(rollbackCases)(
    "completely rolls back after $name",
    async ({ run, expected }) => {
      const order: string[] = [];

      await expect(
        createFeatureStateOwnership({
          lane: "workspace",
          base: { settings: {} },
          build: (state) => {
            run(state, order);
            return state;
          },
        }),
      ).rejects.toBeInstanceOf(Error);

      expect(order).toEqual(expected);
    },
  );

  it("rolls back when a factory returns something other than its builder", async () => {
    const order: string[] = [];

    await expect(
      createFeatureStateOwnership({
        lane: "agent",
        base: {},
        build: (state) => {
          state.add({ owned: syncLifetime("owned", order) });
          return {} as AgentFeatureStateBuilder<object>;
        },
      }),
    ).rejects.toThrow("must return its builder chain");
    expect(order).toEqual(["owned"]);
  });

  it("preserves the original factory error after rollback", async () => {
    const failure = new Error("original");

    await expect(
      createFeatureStateOwnership({
        lane: "agent",
        base: {},
        build: (state) => {
          state.add({ owned: { [Symbol.dispose]() {} } });
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });

  it("awaits rejected incoming asynchronous cleanup before reporting failure", async () => {
    let releaseCleanup: (() => void) | undefined;
    const cleanupCanFinish = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let rejected = false;

    const creation = createFeatureStateOwnership({
      lane: "workspace",
      base: { settings: {} },
      build: (state) => {
        asUnsafe(state).add({
          settings: {
            async [Symbol.asyncDispose]() {
              await cleanupCanFinish;
            },
          },
        });
        return state;
      },
    }).catch((error: unknown) => {
      rejected = true;
      throw error;
    });

    await Promise.resolve();
    expect(rejected).toBe(false);
    releaseCleanup?.();
    await expect(creation).rejects.toThrow("collides with substrate");
    expect(rejected).toBe(true);
  });

  it("keeps a construction poisoned when a factory catches add() failure", async () => {
    await expect(
      createFeatureStateOwnership({
        lane: "agent",
        base: { settings: {} },
        build: (state) => {
          try {
            asUnsafe(state).add({ settings: {} });
          } catch {
            // A state factory cannot turn a rejected addition into success.
          }
          return state;
        },
      }),
    ).rejects.toThrow("collides with substrate");
  });
});
