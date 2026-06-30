import { describe, expect, it } from "vitest";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  StateMessageRegistry,
  createStateMessageAssembler,
  registerStateMessageContributions,
  StateMessageRegistry,
} from "./state-messages";

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult>;

function install(stateMessageRegistry: StateMessageRegistry) {
  const handlers: Handler[] = [];
  const pi = {
    on: (event: string, handler: Handler) => {
      if (event === "before_agent_start") handlers.push(handler);
    },
  } as unknown as ExtensionAPI;
  void createStateMessageAssembler(stateMessageRegistry)(pi);
  expect(handlers).toHaveLength(1);

  return async (entries: SessionEntry[] = []) =>
    handlers[0](
      {
        type: "before_agent_start",
        prompt: "hi",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      } as unknown as BeforeAgentStartEvent,
      {
        sessionManager: { getBranch: () => entries },
      } as unknown as ExtensionContext,
    );
}

function stateEntry(content: string): SessionEntry {
  return {
    type: "custom_message",
    customType: "uix.state",
    content,
  } as unknown as SessionEntry;
}

describe("createStateMessages", () => {
  it("appends one vocabulary section with a bullet per registered tag", async () => {
    const sm = new StateMessageRegistry();
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
    const run = install(sm);

    const result = await run();

    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("## UIX cockpit state messages");
    expect(result.systemPrompt).toContain(
      "- `<test-pane-visibility>` — open keys",
    );
    expect(result.systemPrompt).toContain(
      "- `<test-canvas-diff>` — human hunks",
    );
  });

  it("leaves the system prompt alone with no registrations", async () => {
    const run = install(new StateMessageRegistry());
    expect(await run()).toEqual({});
  });

  it("bulk-registers contributions, applies initial update values, and disposes them together", async () => {
    const sm = new StateMessageRegistry();
    const registrations = registerStateMessageContributions(sm, "test", [
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
    const run = install(sm);

    const result = await run();
    expect(result.message?.content).toContain("<test-pane-visibility>");
    expect(result.message?.content).toContain('{"canvases_open":["main"]}');
    expect(result.message?.content).toContain("<test-canvas-diff>\nchanged");

    registrations[Symbol.dispose]();
    expect((await run()).message).toBeUndefined();
  });

  it("flushes updated state as one tagged section inside one uix.state envelope", async () => {
    const sm = new StateMessageRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });
    const run = install(sm);

    const result = await run();

    expect(result.message).toEqual({
      customType: "uix.state",
      content: [
        "<uix-state>",
        "<test-pane-visibility>",
        '{"canvases_open":["main"]}',
        "</test-pane-visibility>",
        "</uix-state>",
      ].join("\n"),
      details: { "test.pane-visibility": { canvases_open: ["main"] } },
      display: false,
    });
  });

  it("suppresses an update section whose materialized body matches the nearest persisted tag", async () => {
    const sm = new StateMessageRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });
    const run = install(sm);

    const persisted = (await run()).message;
    expect(persisted).toBeDefined();

    const next = await run([stateEntry(persisted!.content as string)]);
    expect(next.message).toBeUndefined();

    visibility.update({ canvases_open: [] });
    const changed = await run([stateEntry(persisted!.content as string)]);
    expect(changed.message?.content).toContain('{"canvases_open":[]}');
  });

  it("walks past uix.state entries that do not carry the tag", async () => {
    const sm = new StateMessageRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });
    const run = install(sm);

    const visible = (await run()).message!.content as string;
    const other = "<uix-state>\n<other>\nx\n</other>\n</uix-state>";
    const result = await run([stateEntry(visible), stateEntry(other)]);
    expect(result.message).toBeUndefined();
  });

  it("keeps the update value so an unpersisted flush resends", async () => {
    const sm = new StateMessageRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });
    const run = install(sm);

    expect((await run()).message).toBeDefined();
    expect((await run()).message).toBeDefined();
  });

  it("materializes a manual section every run when it returns content", async () => {
    let reads = 0;
    const sm = new StateMessageRegistry();
    sm.register("test", {
      name: "canvas-diff",
      description: "d",
      materialize: () => {
        reads++;
        return { content: "same hunks", details: { hunks: 1 } };
      },
    });
    const run = install(sm);

    const first = (await run()).message!;
    expect(first.details).toEqual({ "test.canvas-diff": { hunks: 1 } });

    const again = await run([stateEntry(first.content as string)]);
    expect(again.message?.content).toContain("same hunks");
    expect(reads).toBe(2);
  });

  it("sends nothing when manual materialization returns undefined", async () => {
    const sm = new StateMessageRegistry();
    sm.register("test", {
      name: "canvas-diff",
      description: "d",
      materialize: () => undefined,
    });
    const run = install(sm);
    expect((await run()).message).toBeUndefined();
  });

  it("combines sections from multiple registrations in registration order", async () => {
    const sm = new StateMessageRegistry();
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
    const run = install(sm);

    const content = (await run()).message!.content as string;
    expect(content.indexOf("<test-pane-visibility>")).toBeLessThan(
      content.indexOf("<test-canvas-diff>"),
    );
    expect(content.startsWith("<uix-state>\n")).toBe(true);
    expect(content.endsWith("\n</uix-state>")).toBe(true);
  });

  it("validates update payloads against the registration schema", () => {
    const sm = new StateMessageRegistry();
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
    const sm = new StateMessageRegistry();
    const moves = sm.register("game", {
      name: "moves",
      description: "moves",
      buffer: { kind: "append", schema: Type.Object({ move: Type.String() }) },
    });
    moves.append({ move: "e4" });
    moves.append({ move: "e5" });
    const run = install(sm);

    const first = (await run()).message!;
    expect(first.content).toContain('[{"move":"e4"},{"move":"e5"}]');

    // Not persisted yet: the same pending events are retried.
    expect((await run()).message?.content).toContain("e4");

    // Persisted: the confirmed batch drains, so there is nothing left to send.
    expect(
      (await run([stateEntry(first.content as string)])).message,
    ).toBeUndefined();

    moves.append({ move: "Nf3" });
    const next = await run([stateEntry(first.content as string)]);
    expect(next.message?.content).not.toContain("e4");
    expect(next.message?.content).toContain("Nf3");
  });

  it("custom materialization runs before update dedupe", async () => {
    const sm = new StateMessageRegistry();
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
    const run = install(sm);

    const first = (await run()).message!;
    expect(first.content).toContain("count=1");
    expect(
      (await run([stateEntry(first.content as string)])).message,
    ).toBeUndefined();
  });

  it("stops flushing a section once its handle is disposed, and frees the tag", async () => {
    const sm = new StateMessageRegistry();
    const visibility = sm.register("test", {
      name: "pane-visibility",
      description: "d",
      buffer: {
        kind: "update",
        schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
      },
    });
    visibility.update({ canvases_open: ["main"] });
    const run = install(sm);

    expect((await run()).message?.content).toContain("<test-pane-visibility>");

    visibility[Symbol.dispose]();
    expect((await run()).message).toBeUndefined();

    expect(() =>
      sm.register("test", {
        name: "pane-visibility",
        description: "d",
        materialize: () => undefined,
      }),
    ).not.toThrow();
  });

  it("rejects a second active registration of the same name within a feature", () => {
    const sm = new StateMessageRegistry();
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
