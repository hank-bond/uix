import { describe, expect, it } from "vitest";

import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  AgentContextRegistry,
  buildAgentContextMessage,
  createAgentContextVocabularyInstaller,
  registerAgentContextContributions,
} from "./registry";

function flush(registry: AgentContextRegistry, branch: SessionEntry[] = []) {
  return buildAgentContextMessage(
    { getBranch: () => branch } as SessionManager,
    registry,
  );
}

function stateEntry(content: string): SessionEntry {
  return {
    type: "custom_message",
    customType: "uix.state",
    content,
  } as unknown as SessionEntry;
}

function turnStateEntry(
  id: string,
  data: { cwd?: string; state: Record<string, unknown> },
): SessionEntry {
  return {
    id,
    parentId: undefined,
    timestamp: new Date(0).toISOString(),
    type: "custom",
    customType: "uix.turn-state",
    data,
  } as unknown as SessionEntry;
}

describe("AgentContextRegistry", () => {
  it("installs vocabulary section with a bullet per registered tag", async () => {
    const sm = new AgentContextRegistry();
    sm.register("test", {
      name: "pane-visibility",
      description: "open keys",
      buffer: { kind: "update", schema: Type.Object({ open: Type.Boolean() }) },
    });
    sm.register("test", {
      name: "canvas-diff",
      description: "human hunks",
      materialize: () => undefined,
    });

    const handlers: Array<
      (event: unknown, ctx: unknown) => Promise<{ systemPrompt?: string }>
    > = [];
    void createAgentContextVocabularyInstaller(sm)({
      on: (_event: string, handler: (typeof handlers)[0]) => {
        handlers.push(handler);
      },
    } as Parameters<
      ReturnType<typeof createAgentContextVocabularyInstaller>
    >[0]);
    expect(handlers).toHaveLength(1);

    const result = await handlers[0](
      { systemPrompt: "BASE" },
      {} as Parameters<(typeof handlers)[0]>[1],
    );

    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("## UIX cockpit state messages");
    expect(result.systemPrompt).toContain(
      "- `<test.pane-visibility>` — open keys",
    );
    expect(result.systemPrompt).toContain(
      "- `<test.canvas-diff>` — human hunks",
    );
  });

  it("does not install vocabulary with no registrations", () => {
    const handlers: Array<
      (event: unknown, ctx: unknown) => Promise<{ systemPrompt?: string }>
    > = [];
    void createAgentContextVocabularyInstaller(new AgentContextRegistry())({
      on: (_event: string, handler: (typeof handlers)[0]) => {
        handlers.push(handler);
      },
    } as Parameters<
      ReturnType<typeof createAgentContextVocabularyInstaller>
    >[0]);
    // No vocabulary → no handler installed.
    expect(handlers).toHaveLength(0);
  });

  it("bulk-registers contributions, applies initial update values, and disposes them together", async () => {
    const sm = new AgentContextRegistry();
    const registrations = registerAgentContextContributions(sm, "test", [
      {
        name: "pane-visibility",
        description: "d",
        buffer: {
          kind: "update",
          schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
        },
        initialValue: { canvases_open: ["main"] },
      },
      {
        name: "canvas-diff",
        description: "diffs",
        materialize: () => ({ content: "changed" }),
      },
    ]);

    const result = await flush(sm);
    expect(result?.content).toContain("<test.pane-visibility>");
    expect(result?.content).toContain('{"canvases_open":["main"]}');
    expect(result?.content).toContain("<test.canvas-diff>\nchanged");

    registrations[Symbol.dispose]();
    expect(await flush(sm)).toBeUndefined();
  });

  it("flushes updated state as one tagged section inside one uix.state envelope", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });

    const result = await flush(sm);

    expect(result).toEqual({
      content: [
        "<uix-state>",
        "<test.pane-visibility>",
        '{"canvases_open":["main"]}',
        "</test.pane-visibility>",
        "</uix-state>",
      ].join("\n"),
      details: { "test.pane-visibility": { canvases_open: ["main"] } },
    });
  });

  it("suppresses an update section whose materialized body matches the nearest persisted tag", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });

    const persisted = await flush(sm);
    expect(persisted).toBeDefined();

    const next = await flush(sm, [stateEntry(persisted!.content)]);
    expect(next).toBeUndefined();

    visibility.update({ canvases_open: [] });
    const changed = await flush(sm, [stateEntry(persisted!.content)]);
    expect(changed?.content).toContain('{"canvases_open":[]}');
  });

  it("walks past uix.state entries that do not carry the tag", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });

    const visible = (await flush(sm))!.content;
    const other = "<uix-state>\n<other>\nx\n</other>\n</uix-state>";
    const result = await flush(sm, [stateEntry(visible), stateEntry(other)]);
    expect(result).toBeUndefined();
  });

  it("keeps the update value so an unpersisted flush resends", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });

    expect(await flush(sm)).toBeDefined();
    expect(await flush(sm)).toBeDefined();
  });

  it("passes feature-scoped turn-state history to materialized contributions", async () => {
    const sm = new AgentContextRegistry();
    sm.register("canvas", {
      name: "canvas-diff",
      description: "d",
      materialize: (ctx) => {
        const [current, previous] = ctx.turnStates<{ main: string }>({
          limit: 2,
        });
        return {
          content: `${previous?.state.main ?? "none"}->${current?.state.main ?? "none"}`,
        };
      },
    });

    const result = await flush(sm, [
      turnStateEntry("older", {
        cwd: "/old",
        state: { canvas: { main: "v1" }, chat: { selected: "c1" } },
      }),
      turnStateEntry("chat-only", {
        cwd: "/chat",
        state: { chat: { selected: "c2" } },
      }),
      turnStateEntry("newer", {
        cwd: "/new",
        state: { canvas: { main: "v2" } },
      }),
    ]);

    expect(result?.content).toContain("v1->v2");
  });

  it("materializes a manual section every run when it returns content", async () => {
    let reads = 0;
    const sm = new AgentContextRegistry();
    sm.register("test", {
      name: "canvas-diff",
      description: "d",
      materialize: () => {
        reads++;
        return { content: "same hunks", details: { hunks: 1 } };
      },
    });

    const first = (await flush(sm))!;
    expect(first.details).toEqual({ "test.canvas-diff": { hunks: 1 } });

    const again = await flush(sm, [stateEntry(first.content)]);
    expect(again?.content).toContain("same hunks");
    expect(reads).toBe(2);
  });

  it("sends nothing when manual materialization returns undefined", async () => {
    const sm = new AgentContextRegistry();
    sm.register("test", {
      name: "canvas-diff",
      description: "d",
      materialize: () => undefined,
    });
    expect(await flush(sm)).toBeUndefined();
  });

  it("combines sections from multiple registrations in registration order", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    sm.register("test", {
      name: "canvas-diff",
      description: "d",
      materialize: () => ({ content: "## main\nhunks" }),
    });
    visibility.update({ canvases_open: ["main"] });

    const content = (await flush(sm))!.content;
    expect(content.indexOf("<test.pane-visibility>")).toBeLessThan(
      content.indexOf("<test.canvas-diff>"),
    );
    expect(content.startsWith("<uix-state>\n")).toBe(true);
    expect(content.endsWith("\n</uix-state>")).toBe(true);
  });

  it("validates update payloads against the registration schema", () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    expect(() =>
      visibility.update({ canvases_open: [1] } as unknown as {
        canvases_open: string[];
      }),
    ).toThrow(/Invalid test.pane-visibility payload/);
    expect(() => visibility.update({ canvases_open: ["main"] })).not.toThrow();
  });

  it("appends pending values and confirms drain from the branch", async () => {
    const sm = new AgentContextRegistry();
    const moves = sm.register("game", {
      name: "moves",
      description: "moves",
      buffer: { kind: "append", schema: Type.Object({ move: Type.String() }) },
    });
    moves.append({ move: "e4" });
    moves.append({ move: "e5" });

    const first = (await flush(sm))!;
    expect(first.content).toContain('[{"move":"e4"},{"move":"e5"}]');

    // Not persisted yet: the same pending events are retried.
    expect((await flush(sm))?.content).toContain("e4");

    // Persisted: the confirmed batch drains, so there is nothing left to send.
    expect(await flush(sm, [stateEntry(first.content)])).toBeUndefined();

    moves.append({ move: "Nf3" });
    const next = await flush(sm, [stateEntry(first.content)]);
    expect(next?.content).not.toContain("e4");
    expect(next?.content).toContain("Nf3");
  });

  it("custom materialization runs before update dedupe", async () => {
    const sm = new AgentContextRegistry();
    const value = sm.register("test", {
      name: "value",
      description: "d",
      buffer: { kind: "update", schema: Type.Object({ count: Type.Number() }) },
      materialize: ({ value: payload }) => ({
        content: `count=${payload.count}`,
        details: payload,
      }),
    });
    value.update({ count: 1 });

    const first = (await flush(sm))!;
    expect(first.content).toContain("count=1");
    expect(await flush(sm, [stateEntry(first.content)])).toBeUndefined();
  });

  it("stops flushing a section once its handle is disposed, and frees the tag", async () => {
    const sm = new AgentContextRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });

    expect((await flush(sm))?.content).toContain("<test.pane-visibility>");

    visibility[Symbol.dispose]();
    expect(await flush(sm)).toBeUndefined();

    expect(() =>
      sm.register("test", {
        name: "pane-visibility",
        description: "d",
        materialize: () => undefined,
      }),
    ).not.toThrow();
  });

  it("rejects a second active registration of the same name within a feature", () => {
    const sm = new AgentContextRegistry();
    sm.register("test", {
      name: "a",
      description: "d",
      materialize: () => undefined,
    });
    expect(() =>
      sm.register("test", {
        name: "a",
        description: "again",
        materialize: () => undefined,
      }),
    ).toThrow(/already registered/);
  });
});
