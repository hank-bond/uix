import path from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

import { resolveWorkspace } from "./workspace";

describe("resolveWorkspace", () => {
  it("derives roots from a manifest file target", () => {
    const ws = resolveWorkspace("/tmp/demo/uix.workspace.json");
    expect(ws.stateRoot).toBe("/tmp/demo");
    expect(ws.agentCwd).toBe("/tmp/demo");
    expect(ws.manifestPath).toBe("/tmp/demo/uix.workspace.json");
  });

  it("treats a directory target as the workspace root", () => {
    const ws = resolveWorkspace("/tmp/demo");
    expect(ws.stateRoot).toBe("/tmp/demo");
    expect(ws.manifestPath).toBe("/tmp/demo/uix.workspace.json");
  });

  it("resolves relative targets against the cwd", () => {
    const ws = resolveWorkspace("demo");
    expect(ws.stateRoot).toBe(path.resolve(process.cwd(), "demo"));
  });

  it("defaults to the cwd when no target is given", () => {
    const ws = resolveWorkspace();
    expect(ws.stateRoot).toBe(process.cwd());
    expect(ws.manifestPath).toBe(
      path.join(process.cwd(), "uix.workspace.json"),
    );
  });
});
