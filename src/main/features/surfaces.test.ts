import { describe, expect, it } from "vitest";

import {
  registerSurfaceContributions,
  resolveSurfaceContributions,
  SurfaceRegistry,
} from "./surfaces";

describe("SurfaceRegistry", () => {
  it("resolves relative refs against the entry dir and keeps absolute refs", () => {
    const resolvedContributions = resolveSurfaceContributions(
      "hello",
      ["./workspace/surface.tsx", "/abs/other.tsx"],
      "/ws/features/hello",
    );

    expect(resolvedContributions).toEqual([
      {
        featureId: "hello",
        entry: "/ws/features/hello/workspace/surface.tsx",
        featureRoot: "/ws/features/hello",
      },
      {
        featureId: "hello",
        entry: "/abs/other.tsx",
        featureRoot: "/ws/features/hello",
      },
    ]);
  });

  it("lists in manifest and declaration order across features", () => {
    const registry = new SurfaceRegistry();
    registerSurfaceContributions(registry, "a", ["./one.tsx"], "/ws/a");
    registerSurfaceContributions(
      registry,
      "b",
      ["./one.tsx", "./two.tsx"],
      "/ws/b",
    );

    expect(registry.list().map((s) => `${s.featureId}:${s.entry}`)).toEqual([
      "a:/ws/a/one.tsx",
      "b:/ws/b/one.tsx",
      "b:/ws/b/two.tsx",
    ]);
  });

  it("disposal removes only the disposed feature's entries", () => {
    const registry = new SurfaceRegistry();
    const surfacesDisposable = registerSurfaceContributions(
      registry,
      "a",
      ["./a.tsx"],
      "/ws",
    );
    registerSurfaceContributions(registry, "b", ["./b.tsx"], "/ws");

    surfacesDisposable[Symbol.dispose]();

    expect(registry.list()).toEqual([
      { featureId: "b", entry: "/ws/b.tsx", featureRoot: "/ws" },
    ]);
  });

  it("rejects empty surface refs", () => {
    expect(() => resolveSurfaceContributions("hello", [""], "/ws")).toThrow(
      "Feature hello has an invalid surface entry ref",
    );
  });
});
