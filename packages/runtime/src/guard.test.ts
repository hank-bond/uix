import { describe, expect, it, vi } from "vitest";

import { createGuard, type Guard } from "./guard";

interface TestValue {
  readonly generation: number;
}

function createHarness(): {
  readonly guard: Guard<TestValue>;
  readonly retain: ReturnType<typeof vi.fn>;
  readonly onDispose: ReturnType<typeof vi.fn>;
} {
  const onDispose = vi.fn();
  const retain = vi.fn<(origin: string) => Guard<TestValue>>();
  const guard = createGuard({
    label: "Test",
    value: { generation: 1 },
    retain,
    onDispose,
  });
  retain.mockImplementation((origin) =>
    createGuard({
      label: `Test ${origin}`,
      value: { generation: 1 },
      retain,
      onDispose,
    }),
  );
  return { guard, retain, onDispose };
}

describe("Guard", () => {
  it("provides a value and mints independently disposable retained guards", () => {
    const harness = createHarness();
    using retained = harness.guard.retain("operation");

    expect(harness.guard.value.generation).toBe(1);
    expect(retained.value.generation).toBe(1);
    expect(harness.retain).toHaveBeenCalledWith("operation");

    harness.guard[Symbol.dispose]();
    expect(harness.onDispose).toHaveBeenCalledOnce();
    expect(retained.value.generation).toBe(1);
  });

  it("disposes idempotently and rejects authority afterward", () => {
    const harness = createHarness();

    harness.guard[Symbol.dispose]();
    harness.guard[Symbol.dispose]();

    expect(harness.onDispose).toHaveBeenCalledOnce();
    expect(() => harness.guard.value).toThrow("Test guard is disposed");
    expect(() => harness.guard.retain()).toThrow("Test guard is disposed");
  });
});
