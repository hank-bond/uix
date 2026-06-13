import { describe, expect, it } from "vitest";

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createStateMessages, type StateMessages } from "./state-messages";

type Handler = (
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
) => Promise<BeforeAgentStartEventResult>;

// Captures the assembler's single before_agent_start handler and exposes a
// run() that fires it the way pi would at a turn boundary, against a branch
// of fake session entries.
function install(stateMessages: StateMessages) {
  const handlers: Handler[] = [];
  const pi = {
    on: (event: string, handler: Handler) => {
      if (event === "before_agent_start") handlers.push(handler);
    },
  } as unknown as ExtensionAPI;
  void stateMessages.binding(pi);
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
    const sm = createStateMessages();
    sm.register({
      customType: "uix.pane-visibility",
      description: "open keys",
    });
    sm.register({
      customType: "uix.canvas-diff",
      description: "human hunks",
      atTurnBoundary: () => undefined,
    });
    const run = install(sm);

    const result = await run();

    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("## UIX cockpit state messages");
    expect(result.systemPrompt).toContain("- `<pane-visibility>` — open keys");
    expect(result.systemPrompt).toContain("- `<canvas-diff>` — human hunks");
  });

  it("leaves the system prompt alone with no registrations", async () => {
    const run = install(createStateMessages());
    expect(await run()).toEqual({});
  });

  it("flushes emitted state as one tagged section inside one uix.state envelope", async () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.pane-visibility", description: "d" });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    const result = await run();

    expect(result.message).toEqual({
      customType: "uix.state",
      content: [
        "<uix-state>",
        "<pane-visibility>",
        '{"canvases_open":["main"]}',
        "</pane-visibility>",
        "</uix-state>",
      ].join("\n"),
      details: undefined,
      display: false,
    });
  });

  it("suppresses a change-only section whose body matches the nearest persisted tag", async () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.pane-visibility", description: "d" });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    const persisted = (await run()).message;
    expect(persisted).toBeDefined();

    // Same latched value, now on the branch: nothing to say.
    const next = await run([stateEntry(persisted!.content as string)]);
    expect(next.message).toBeUndefined();

    // Value changes: flushes again.
    sm.emit("uix.pane-visibility", { canvases_open: [] });
    const changed = await run([stateEntry(persisted!.content as string)]);
    expect(changed.message?.content).toContain('{"canvases_open":[]}');
  });

  it("walks past uix.state entries that do not carry the tag", async () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.pane-visibility", description: "d" });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    const visibility = (await run()).message!.content as string;
    // A later turn flushed only some other section; the visibility fact in the
    // older entry still counts as the last persisted value.
    const other = "<uix-state>\n<other>\nx\n</other>\n</uix-state>";
    const result = await run([stateEntry(visibility), stateEntry(other)]);
    expect(result.message).toBeUndefined();
  });

  it("keeps the change-only latch so an unpersisted flush self-heals", async () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.pane-visibility", description: "d" });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    // Flushed twice against an empty branch (the first message never
    // persisted): both send.
    expect((await run()).message).toBeDefined();
    expect((await run()).message).toBeDefined();
  });

  it("consumes the latch under the always policy", async () => {
    const sm = createStateMessages();
    sm.register({
      customType: "uix.pane-visibility",
      description: "d",
      policy: "always",
    });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    expect((await run()).message).toBeDefined();
    expect((await run()).message).toBeUndefined();
  });

  it("always flushes a boundary callback's payload, even when identical to the persisted one", async () => {
    let reads = 0;
    const sm = createStateMessages();
    sm.register({
      customType: "uix.canvas-diff",
      description: "d",
      atTurnBoundary: () => {
        reads++;
        return { content: "same hunks", details: { hunks: 1 } };
      },
    });
    const run = install(sm);

    const first = (await run()).message!;
    expect(first.details).toEqual({ "uix.canvas-diff": { hunks: 1 } });

    // Identical payload already on the branch: an event must not be lost to
    // change-only suppression.
    const again = await run([stateEntry(first.content as string)]);
    expect(again.message?.content).toContain("same hunks");
    expect(reads).toBe(2);
  });

  it("sends nothing when a boundary callback returns undefined", async () => {
    const sm = createStateMessages();
    sm.register({
      customType: "uix.canvas-diff",
      description: "d",
      atTurnBoundary: () => undefined,
    });
    const run = install(sm);
    expect((await run()).message).toBeUndefined();
  });

  it("combines sections from multiple registrations in registration order", async () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.pane-visibility", description: "d" });
    sm.register({
      customType: "uix.canvas-diff",
      description: "d",
      atTurnBoundary: () => ({ content: "## main\nhunks" }),
    });
    sm.emit("uix.pane-visibility", { canvases_open: ["main"] });
    const run = install(sm);

    const content = (await run()).message!.content as string;
    expect(content.indexOf("<pane-visibility>")).toBeLessThan(
      content.indexOf("<canvas-diff>"),
    );
    expect(content.startsWith("<uix-state>\n")).toBe(true);
    expect(content.endsWith("\n</uix-state>")).toBe(true);
  });

  it("validates emitted payloads against the registration schema", () => {
    const sm = createStateMessages();
    sm.register({
      customType: "uix.pane-visibility",
      description: "d",
      schema: Type.Object({ canvases_open: Type.Array(Type.String()) }),
    });
    expect(() =>
      sm.emit("uix.pane-visibility", { canvases_open: [1] }),
    ).toThrow(/Invalid uix.pane-visibility payload/);
    expect(() =>
      sm.emit("uix.pane-visibility", { canvases_open: ["main"] }),
    ).not.toThrow();
  });

  it("rejects misuse at the registration boundary", () => {
    const sm = createStateMessages();
    sm.register({ customType: "uix.a", description: "d" });
    sm.register({
      customType: "uix.b",
      description: "d",
      atTurnBoundary: () => undefined,
    });

    expect(() => sm.emit("uix.unknown", {})).toThrow(/Unregistered/);
    expect(() => sm.emit("uix.b", {})).toThrow(/turn boundary/);
    expect(() =>
      sm.register({ customType: "uix.a", description: "again" }),
    ).toThrow(/already registered/);

    install(sm);
    expect(() =>
      sm.register({ customType: "uix.late", description: "d" }),
    ).toThrow(/after the assembler/);
  });
});
