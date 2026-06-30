import { describe, expect, it } from "vitest";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import {
  StateMessageRegistry,
  createStateMessageAssembler,
  registerStateMessageContributions,
} from "#backend/agent/state-messages";
import {
  createAgentToolInstaller,
  AgentToolRegistry,
  registerAgentToolContributions,
} from "#backend/agent/tools";
import {
  createStateCoordinator,
  StateRegistry,
  registerStateContributions,
} from "#backend/state/registry";

import { CanvasDocumentBuffer } from "../document-buffer";
import type { CanvasContext } from "../context";
import type { DocumentStore, DocumentVersion } from "#backend/documents/store";
import type { FeatureContext } from "#backend/features/context";

import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasStateContributions } from "./state";
import { createCanvasStateMessageContributions } from "./state-messages";

function memoryStore(): DocumentStore {
  const map = new Map<string, string>();
  const versions = new Map<string, DocumentVersion>();
  return {
    getCurrent: (docId) => Promise.resolve(map.get(docId) ?? null),
    setCurrent: (docId, content) => {
      map.set(docId, content);
      return Promise.resolve();
    },
    snapshotCurrent: (docId, meta) => {
      const version: DocumentVersion<typeof meta> = {
        id: `v${versions.size + 1}`,
        documentId: docId,
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
          | DocumentVersion<TMeta>
          | undefined) ?? null,
      );
    },
  };
}

function fakeCanvasContext(
  overrides: Partial<CanvasContext> = {},
): CanvasContext {
  const store = overrides.store ?? memoryStore();
  const base: FeatureContext = {
    documents: { createStore: () => store },
    channels: overrides.channels ?? { publish: () => undefined },
  };
  return {
    ...base,
    store,
    buffer: overrides.buffer ?? new CanvasDocumentBuffer(store),
    openCanvasKeys: overrides.openCanvasKeys ?? ["main"],
    agentChangedCanvasKeys: overrides.agentChangedCanvasKeys ?? new Set(),
  };
}

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult>;

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

// The canvas agent tool/state/state-message contributions and the
// driver-installed substrate installers wired against an in-memory store and a
// fake pi handle.
function setup() {
  const ctx = fakeCanvasContext();
  const state = new StateRegistry();
  const stateMessages = new StateMessageRegistry();
  const agentTools = new AgentToolRegistry();
  const canvasState = registerStateContributions(
    state,
    "canvas",
    createCanvasStateContributions(ctx),
  );
  const canvasStateMessages = registerStateMessageContributions(
    stateMessages,
    "canvas",
    createCanvasStateMessageContributions(ctx),
  );
  const canvasAgentTools = registerAgentToolContributions(
    agentTools,
    "canvas",
    createCanvasAgentToolContributions(ctx),
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
  void createAgentToolInstaller(agentTools)(pi);
  void createStateCoordinator(state)(pi);
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

  const extCtx = { cwd: "/work", sessionManager: { getBranch: () => [] } };

  return {
    store: ctx.store,
    tools,
    turnBoundary,
    entries,
    writebackCanvas: (key: string, html: string) =>
      ctx.buffer.writeback(key, html),
    inputBoundary: async () => {
      await inputHandlers[0]({}, extCtx as unknown as ExtensionContext);
    },
    agentEnd: async () => {
      await agentEndHandlers[0]({}, extCtx as unknown as ExtensionContext);
    },
    disposeCanvasState: () => canvasState[Symbol.dispose](),
    disposeCanvasStateMessages: () => canvasStateMessages[Symbol.dispose](),
    disposeCanvasAgentTools: () => canvasAgentTools[Symbol.dispose](),
  };
}

describe("canvas agent tool contributions", () => {
  it("teaches both canvas tags in the system prompt vocabulary", async () => {
    const { turnBoundary } = setup();
    const result = await turnBoundary();
    expect(result.systemPrompt).toContain("- `<canvas-pane-visibility>`");
    expect(result.systemPrompt).toContain("- `<canvas-canvas-diff>`");
  });

  it("reports open canvases as a sorted JSON body", async () => {
    const { turnBoundary } = setup();
    const content = (await turnBoundary()).message!.content as string;
    expect(content).toContain(
      ["<canvas-pane-visibility>", '{"canvases_open":["main"]}'].join("\n"),
    );
  });

  it("surfaces pane writebacks as a canvas-diff section, consumed once", async () => {
    const { tools, turnBoundary, writebackCanvas } = setup();

    // Agent writes the canvas (so it has anchors), then the human edits through
    // the pane writeback path.
    const write = tools.get("canvas__anchor_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>hello</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await writebackCanvas("main", "<p>goodbye</p>");

    const first = (await turnBoundary()).message!.content as string;
    expect(first).toContain("<canvas-canvas-diff>");
    expect(first).toContain("## main");
    expect(first).toContain("goodbye");

    // The diff was consumed; an untouched canvas contributes no section (and
    // visibility has not been branch-confirmed in this fake setup, so the
    // second run still carries it — assert on the diff only).
    const second = (await turnBoundary()).message?.content as
      | string
      | undefined;
    expect(second ?? "").not.toContain("<canvas-canvas-diff>");
  });

  it("keeps pane writeback diff available after input snapshots turn state", async () => {
    const { tools, entries, inputBoundary, turnBoundary, writebackCanvas } =
      setup();

    const write = tools.get("canvas__anchor_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>hello</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await writebackCanvas("main", "<p>goodbye</p>");

    await inputBoundary();
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          state: { canvas: { "doc://canvas/main": "v1" } },
          cwd: "/work",
        },
      },
    ]);

    const content = (await turnBoundary()).message!.content as string;
    expect(content).toContain("<canvas-canvas-diff>");
    expect(content).toContain("## main");
    expect(content).toContain("goodbye");
  });

  it("records canvas snapshot pointers before input and after agent writes", async () => {
    const { tools, entries, inputBoundary, agentEnd } = setup();

    await inputBoundary();
    expect(entries).toEqual([
      {
        customType: "uix.turn-state",
        data: {
          state: { canvas: { "doc://canvas/main": "v1" } },
          cwd: "/work",
        },
      },
    ]);

    const write = tools.get("canvas__anchor_write")!;
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
      data: {
        state: { canvas: { "doc://canvas/main": "v2" } },
        cwd: "/work",
      },
    });
  });
});
