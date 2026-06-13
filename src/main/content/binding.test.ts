import { describe, expect, it } from "vitest";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import { createStateMessages } from "../agent/state-messages";

import { createCanvasAgentBinding } from "./binding";
import type { ContentStore } from "./content-store";

function memoryStore(): ContentStore {
  const map = new Map<string, string>();
  return {
    getCurrent: (docId) => Promise.resolve(map.get(docId) ?? null),
    commit: (docId, content) => {
      map.set(docId, content);
      return Promise.resolve();
    },
  };
}

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult>;

// The canvas binding + the state-message assembler wired the way index.ts
// composes them, against an in-memory store and a fake pi handle.
function setup() {
  const store = memoryStore();
  const stateMessages = createStateMessages();
  const canvasBinding = createCanvasAgentBinding(
    { onCanvasChanged: () => {} },
    store,
    ["main"],
    stateMessages,
  );

  const tools = new Map<string, ToolDefinition>();
  const handlers: Handler[] = [];
  const pi = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    on: (event: string, handler: Handler) => {
      if (event === "before_agent_start") handlers.push(handler);
    },
  } as unknown as ExtensionAPI;
  void canvasBinding(pi);
  void stateMessages.binding(pi);

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

  return { store, tools, turnBoundary };
}

describe("createCanvasAgentBinding state messages", () => {
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
    // visibility was already flushed against an empty branch each run, so the
    // second run still carries it — assert on the diff only).
    const second = (await turnBoundary()).message?.content as
      | string
      | undefined;
    expect(second ?? "").not.toContain("<canvas-diff>");
  });
});
