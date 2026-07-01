import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  SessionManager,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import {
  AgentContextRegistry,
  buildAgentContextMessage,
  createAgentContextVocabularyInstaller,
  registerAgentContextContributions,
} from "#backend/agent-context/registry";
import {
  createAgentToolInstaller,
  AgentToolRegistry,
  registerAgentToolContributions,
} from "#backend/agent-tools/registry";
import {
  createTurnStateCoordinator,
  submitTurnStatePrep,
  TurnStateRegistry,
  registerTurnStateContributions,
} from "#backend/turn-state/registry";

import { CanvasDocumentBuffer } from "../document-buffer";
import type { CanvasContext } from "../context";
import type { DocumentStore, DocumentVersion } from "#backend/documents/store";
import type { FeatureContext } from "#backend/features/context";

import { createCanvasAgentToolContributions } from "./agent-tools";
import { createCanvasTurnStateContributions } from "./turn-state";
import { createCanvasAgentContextContributions } from "./agent-context";

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

type VoidHandler = (event: unknown, ctx: ExtensionContext) => Promise<void>;

// The canvas agent tool/turn-state/agent-context contributions and the
// driver-installed substrate installers wired against an in-memory store and a
// fake pi handle.
function setup() {
  const ctx = fakeCanvasContext();
  const state = new TurnStateRegistry();
  const agentContext = new AgentContextRegistry();
  const agentTools = new AgentToolRegistry();
  const canvasState = registerTurnStateContributions(
    state,
    "canvas",
    createCanvasTurnStateContributions(ctx),
  );
  const canvasAgentContext = registerAgentContextContributions(
    agentContext,
    "canvas",
    createCanvasAgentContextContributions(ctx),
  );
  const canvasAgentTools = registerAgentToolContributions(
    agentTools,
    "canvas",
    createCanvasAgentToolContributions(ctx),
  );

  const tools = new Map<string, ToolDefinition>();
  const vocabHandlers: Array<
    (
      event: { systemPrompt: string },
      ctx: ExtensionContext,
    ) => Promise<{ systemPrompt?: string }>
  > = [];
  const agentEndHandlers: VoidHandler[] = [];
  const entries: Array<{ customType: string; data: unknown }> = [];
  const branch: SessionEntry[] = [];

  const sessionManager: SessionManager = {
    appendCustomEntry: (_customType: string, _data: unknown) => "entry-id",
    getBranch: () => branch,
  } as SessionManager;

  const pi = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    on: (event: string, handler: VoidHandler) => {
      if (event === "agent_end") agentEndHandlers.push(handler);
    },
  } as unknown as ExtensionAPI;

  void createAgentToolInstaller(agentTools)(pi);
  void createTurnStateCoordinator(state)(pi);

  // Vocabulary is installed separately — it's the only thing that still uses
  // before_agent_start. The message flush is called directly.
  const vocabPi = {
    on: (event: string, handler: (typeof vocabHandlers)[0]) => {
      if (event === "before_agent_start") vocabHandlers.push(handler);
    },
  } as unknown as ExtensionAPI;
  void createAgentContextVocabularyInstaller(agentContext)(vocabPi);

  const extCtx = {
    cwd: "/work",
    sessionManager: {
      getBranch: () => branch,
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ customType, data });
        branch.push({
          id: `entry-${branch.length + 1}`,
          parentId: undefined,
          timestamp: new Date(0).toISOString(),
          type: "custom",
          customType,
          data,
        } as unknown as SessionEntry);
        return "entry-id";
      },
    },
  };

  return {
    store: ctx.store,
    tools,
    entries,
    writebackCanvas: (key: string, html: string) =>
      ctx.buffer.writeback(key, html),
    inputBoundary: async () => {
      // Drive submit-side turn-state prep directly (no longer via input hook).
      const mgr = {
        appendCustomEntry: (customType: string, data: unknown) => {
          entries.push({ customType, data });
          branch.push({
            id: `entry-${branch.length + 1}`,
            parentId: undefined,
            timestamp: new Date(0).toISOString(),
            type: "custom",
            customType,
            data,
          } as unknown as SessionEntry);
          return "entry-id";
        },
        getBranch: () => branch,
      } as SessionManager;
      await submitTurnStatePrep(mgr, "/work", state);
    },
    agentEnd: async () => {
      await agentEndHandlers[0]({}, extCtx as unknown as ExtensionContext);
    },
    /** Build the agent-context flush message directly (no longer via before_agent_start). */
    flushContext: () => buildAgentContextMessage(sessionManager, agentContext),
    /** System prompt vocabulary (the only thing before_agent_start does now). */
    vocabPrompt: async () => {
      if (vocabHandlers.length === 0) return "BASE";
      const result = await vocabHandlers[0](
        { systemPrompt: "BASE" },
        extCtx as unknown as ExtensionContext,
      );
      return result.systemPrompt ?? "BASE";
    },
    disposeCanvasState: () => canvasState[Symbol.dispose](),
    disposeCanvasAgentContext: () => canvasAgentContext[Symbol.dispose](),
    disposeCanvasAgentTools: () => canvasAgentTools[Symbol.dispose](),
  };
}

describe("canvas agent tool contributions", () => {
  it("teaches both canvas tags in the system prompt vocabulary", async () => {
    const { vocabPrompt } = setup();
    const prompt = await vocabPrompt();
    expect(prompt).toContain("- `<canvas.pane-visibility>`");
    expect(prompt).toContain("- `<canvas.canvas-diff>`");
  });

  it("reports open canvases as a sorted JSON body", async () => {
    const { flushContext } = setup();
    const content = (await flushContext())!.content;
    expect(content).toContain(
      ["<canvas.pane-visibility>", '{"canvases_open":["main"]}'].join("\n"),
    );
  });

  it("does not surface pane writebacks without turn-state snapshots", async () => {
    const { tools, flushContext, writebackCanvas } = setup();

    const write = tools.get("canvas__anchor_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>hello</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await writebackCanvas("main", "<p>goodbye</p>");

    const content = (await flushContext())?.content ?? "";
    expect(content).not.toContain("<canvas.canvas-diff>");
  });

  it("keeps pane writeback diff available after input snapshots turn state", async () => {
    const {
      tools,
      entries,
      inputBoundary,
      flushContext,
      writebackCanvas,
      agentEnd,
    } = setup();

    const write = tools.get("canvas__anchor_write")!;
    await write.execute(
      "t1",
      { key: "main", html: "<p>hello</p>" },
      undefined,
      undefined,
      {} as never,
    );
    await agentEnd();
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
      {
        customType: "uix.turn-state",
        data: {
          state: { canvas: { "doc://canvas/main": "v2" } },
          cwd: "/work",
        },
      },
    ]);

    const content = (await flushContext())!.content;
    expect(content).toContain("<canvas.canvas-diff>");
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
