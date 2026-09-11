import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";

import type { AgentToolDefinition } from "@uix/api/agent-tools";

import { createWorkspaceToolOverrideContributions } from "./agent-tools";
import { feature } from "../index";

function tool(name: "read" | "write" | "edit" | "shell"): AgentToolDefinition {
  const contribution = createWorkspaceToolOverrideContributions().find(
    (entry) => entry.name === name,
  );
  if (!contribution) throw new Error(`Missing ${name} contribution`);
  return contribution.tool;
}

describe("file tool overrides", () => {
  it("forms a surface-less feature with exact-name workspace tools", () => {
    const contributions = feature.agent?.({} as never);
    if (!contributions) throw new Error("Missing Agent factory");

    expect(feature.workspace).toBeUndefined();
    expect(
      contributions.agentToolOverrides?.map((entry) => entry.name),
    ).toEqual(["read", "write", "edit", "shell"]);
  });

  it("require a reason while preserving Pi's baseline arguments", () => {
    expect(
      Value.Check(tool("read").parameters, {
        path: "src/main.ts",
        reason: "I need to inspect the entry point.",
      }),
    ).toBe(true);
    expect(Value.Check(tool("read").parameters, { path: "src/main.ts" })).toBe(
      false,
    );

    expect(
      Value.Check(tool("write").parameters, {
        path: "src/main.ts",
        content: "export {};",
        reason: "I need to create the entry point.",
      }),
    ).toBe(true);
    expect(
      Value.Check(tool("write").parameters, {
        path: "src/main.ts",
        content: "export {};",
      }),
    ).toBe(false);

    expect(
      Value.Check(tool("shell").parameters, {
        command: "npm test",
        reason: "I need to verify the changes.",
      }),
    ).toBe(true);
    expect(Value.Check(tool("shell").parameters, { command: "npm test" })).toBe(
      false,
    );
  });

  it("requires a reason for edit while preserving its batch edit schema", () => {
    const args = {
      path: "notes.md",
      edits: [{ oldText: "before", newText: "after" }],
    };
    expect(Value.Check(tool("edit").parameters, args)).toBe(false);
    expect(
      Value.Check(tool("edit").parameters, {
        ...args,
        reason: "Update notes.",
      }),
    ).toBe(true);
    expect(tool("edit").description).toContain("Include a concise reason");
  });

  it.each([
    { edits: [{ oldText: "before", newText: "after" }] },
    { edits: '[{"oldText":"before","newText":"after"}]' },
    { oldText: "before", newText: "after" },
  ])("preserves Pi argument preparation and the reason: %j", (input) => {
    const edit = tool("edit");
    if (!edit.prepareArguments) throw new Error("Missing edit preparation");
    const prepared = edit.prepareArguments({
      ...input,
      path: "notes.md",
      reason: "Update notes.",
    });
    expect(prepared).toEqual({
      path: "notes.md",
      edits: [{ oldText: "before", newText: "after" }],
      reason: "Update notes.",
    });
    expect(Value.Check(edit.parameters, prepared)).toBe(true);
  });

  it("does not let preparation bypass reason or edit validation", () => {
    const edit = tool("edit");
    if (!edit.prepareArguments) throw new Error("Missing edit preparation");
    for (const input of [
      { path: "notes.md", edits: '[{"oldText":"before","newText":"after"}]' },
      { path: "notes.md", edits: "not JSON", reason: "Update notes." },
      {
        path: "notes.md",
        edits: '[{"oldText":"before"}]',
        reason: "Update notes.",
      },
    ]) {
      expect(Value.Check(edit.parameters, edit.prepareArguments(input))).toBe(
        false,
      );
    }
  });

  it("delegates execution to Pi under the execution cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "workspace-tools-"));
    await writeFile(join(cwd, "input.txt"), "hello\n", "utf8");
    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "session-id",
        getSessionFile: () => undefined,
      },
      thinkingLevel: "off",
    } as ExtensionContext;

    const readResult = await tool("read").execute(
      "read-1",
      {
        path: "input.txt",
        reason: "I need to inspect the fixture.",
      },
      undefined,
      undefined,
      ctx,
    );
    expect(readResult.content).toContainEqual({
      type: "text",
      text: "hello\n",
    });

    await tool("write").execute(
      "write-1",
      {
        path: "nested/output.txt",
        content: "written",
        reason: "I need to create the expected output.",
      },
      undefined,
      undefined,
      ctx,
    );
    await expect(
      readFile(join(cwd, "nested", "output.txt"), "utf8"),
    ).resolves.toBe("written");

    const edit = tool("edit");
    if (!edit.prepareArguments) throw new Error("Missing edit preparation");
    const prepared = edit.prepareArguments({
      path: "input.txt",
      edits: JSON.stringify([{ oldText: "hello", newText: "updated" }]),
      reason: "I need to update the fixture.",
    });
    expect(Value.Check(edit.parameters, prepared)).toBe(true);
    await edit.execute("edit-1", prepared, undefined, undefined, ctx);
    await expect(readFile(join(cwd, "input.txt"), "utf8")).resolves.toBe(
      "updated\n",
    );

    const shellResult = await tool("shell").execute(
      "shell-1",
      {
        command: "pwd",
        reason: "I need to verify the execution directory.",
      },
      undefined,
      undefined,
      ctx,
    );
    expect(shellResult.content).toContainEqual({
      type: "text",
      text: `${await realpath(cwd)}\n`,
    });
  });
});
