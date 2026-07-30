import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";

import feature from "../index";
import { createWorkspaceToolOverrideContributions } from "./agent-tools";

function tool(name: "read" | "write" | "edit" | "command") {
  const contribution = createWorkspaceToolOverrideContributions().find(
    (entry) => entry.name === name,
  );
  if (!contribution) throw new Error(`Missing ${name} contribution`);
  return contribution.tool;
}

describe("file tool overrides", () => {
  it("forms a surface-less feature with exact-name workspace tools", () => {
    const contributions = feature.contribute({} as never);

    expect(contributions.surfaces).toBeUndefined();
    expect(
      contributions.agentToolOverrides?.map((entry) => entry.name),
    ).toEqual(["read", "write", "edit", "command"]);
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
      Value.Check(tool("command").parameters, {
        command: "npm test",
        reason: "I need to verify the changes.",
      }),
    ).toBe(true);
    expect(
      Value.Check(tool("command").parameters, { command: "npm test" }),
    ).toBe(false);
  });

  it("delegates execution to Pi under the execution cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "uix-workspace-tools-"));
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

    await tool("edit").execute(
      "edit-1",
      {
        path: "input.txt",
        edits: [{ oldText: "hello", newText: "updated" }],
      },
      undefined,
      undefined,
      ctx,
    );
    await expect(readFile(join(cwd, "input.txt"), "utf8")).resolves.toBe(
      "updated\n",
    );

    const commandResult = await tool("command").execute(
      "command-1",
      {
        command: "pwd",
        reason: "I need to verify the execution directory.",
      },
      undefined,
      undefined,
      ctx,
    );
    expect(commandResult.content).toContainEqual({
      type: "text",
      text: `${await realpath(cwd)}\n`,
    });
  });
});
