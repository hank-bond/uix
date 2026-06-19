import { describe, expect, it } from "vitest";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import {
  createStateMessages,
  createStateMessageAssembler,
} from "../agent/state-messages";

import { createCanvasAgentInstaller } from "./agent-installer";
import type { ContentStore, ContentVersion } from "./content-store";

function memoryStore(): ContentStore {
  const map = new Map<string, string>();
  const versions = new Map<string, ContentVersion>();
  return {
    getCurrent: (docId) => Promise.resolve(map.get(docId) ?? null),
    commit: (docId, content) => {
      map.set(docId, content);
      return Promise.resolve();
    },
    snapshotCurrent: (docId, meta) => {
      const version: ContentVersion<typeof meta> = {
        id: `v${versions.size + 1}`,
        docId,
        content: map.get(docId) ?? "",
        meta,
        createdAt: new Date(0).toISOString(),
      };
      versions.set(`${docId}:${version.id}`, version);
      return Promise.resolve(version);
    },
    getVersion<TMeta>(docId: string, versionId: string) {
      return Promise.resolve(
        (versions.get(`${docId}:${versionId}`) as
          | ContentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
}

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult>;

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

// The canvas agent installer + the driver-installed state-message assembler wired
// against an in-memory store and a fake pi handle.
function setup() {
  const store = memoryStore();
  const stateMessages = createStateMessages();
  const canvasFacet = createCanvasAgentInstaller(
    { onCanvasChanged: () => {} },
    store,
    ["main"],
    stateMessages,
  );

  const tools = new Map<string, ToolDefinition>();
  const handlers: Handler[] = [];
  const inputHandlers: VoidHandler[] = [];
  const agentEndHandlers: VoidHandler[] = [];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    appendEntry: (customType: string, data: unknown) => {
      entries.push({ customType, data });
    },
    on: (event: string, handler: Handler | VoidHandler) => {
      if (event === "before_agent_start") handlers.push(handler as Handler);
      if (event === "input") inputHandlers.push(handler as VoidHandler);
      if (event === "agent_end") agentEndHandlers.push(handler as VoidHandler);
    },
  } as unknown as ExtensionAPI;
  void canvasFacet(pi);
  void createStateMessageAssembler(stateMessages)(pi);

  const turnBoundary = async () =>
    handlers[0](
      {
        type: "before_agent_start",
        prompt: "hi",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      } as unknown as BeforeAgentStartEvent,
      {
        sessionManager: { getBranch: () => [] },
      } as unknown as ExtensionContext,
    );

  const ctx = { cwd: "/work", sessionManager: { getBranch: () => [] } };

  return {
    store,
    tools,
    turnBoundary,
    entries,
    inputBoundary: async () => {
      await inputHandlers[0]({}, ctx as unknown as ExtensionContext);
    },
    agentEnd: async () => {
      await agentEndHandlers[0]({}, ctx as unknown as ExtensionContext);
    },
  };
}

describe("createCanvasAgentInstaller state messages", () => {
  it("teaches both canvas tags in the system prompt vocabulary", async () => {
    const { turnBoundary } = setup();
    const result = await turnBoundary();
    expect(result.systemPrompt).toContain("- `<pane-visibility>`");
    expect(result.systemPrompt).toContain("- `<canvas-diff>`");
  });

  it("reports open canvases as a sorted JSON body", async () => {
    const { turnBoundary } = setup();
    const content = (await turnBoundary()).message!.content as string;
    expect(content).toContain(
      ["<pane-visibility>", '{"canvases_open":["main"]}'].join("\n"),
    );
  });

  it("surfaces human store edits as a canvas-diff section, consumed once", async () => {
    const { store, tools, turnBoundary } = setup();

    // Agent writes the canvas (so it has anchors), then the human edits the
    // store behind it — the writeback path.
    const write = tools.get("uix_canvas_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>hello</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await store.commit("main", "<p>goodbye</p>");

    const first = (await turnBoundary()).message!.content as string;
    expect(first).toContain("<canvas-diff>");
    expect(first).toContain("## main");
    expect(first).toContain("goodbye");

    // The diff was consumed; an untouched canvas contributes no section (and
    // visibility has not been branch-confirmed in this fake setup, so the
    // second run still carries it — assert on the diff only).
    const second = (await turnBoundary()).message?.content as
      | string
      | undefined;
    expect(second ?? "").not.toContain("<canvas-diff>");
  });

  it("records canvas snapshot pointers before input and after agent writes", async () => {
    const { tools, entries, inputBoundary, agentEnd } = setup();

    await inputBoundary();
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: { panes: { "canvas/main": "v1" }, cwd: "/work" },
      },
    ]);

    const write = tools.get("uix_canvas_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>agent</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await agentEnd();

    expect(entries[1]).toEqual({
      customType: "uix.turn-state",
      data: { panes: { "canvas/main": "v2" }, cwd: "/work" },
    });
  });
});
