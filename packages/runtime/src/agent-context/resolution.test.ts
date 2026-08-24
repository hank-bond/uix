import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
  resolveAgentContextContribution,
  toAgentContextCanonicalId,
} from "./resolution";

describe("toAgentContextCanonicalId", () => {
  it("joins the feature id and local name", () => {
    expect(toAgentContextCanonicalId("canvas", "canvas-diff")).toBe(
      "canvas.canvas-diff",
    );
  });

  it("rejects invalid id segments", () => {
    expect(() => toAgentContextCanonicalId("Canvas", "canvas-diff")).toThrow(
      "Invalid feature id",
    );
    expect(() => toAgentContextCanonicalId("canvas", "CanvasDiff")).toThrow(
      "Invalid state message name",
    );
  });
});

describe("resolveAgentContextContribution", () => {
  it("derives ids and preserves an update contribution's behavior", () => {
    const schema = Type.Object({ open: Type.Boolean() });
    const materialize = ({
      value,
    }: {
      value: { open: boolean };
    }): { content: string } => ({
      content: String(value.open),
    });

    const resolved = resolveAgentContextContribution("canvas", {
      name: "visibility",
      description: "open surfaces",
      buffer: { kind: "update", schema },
      materialize,
    });

    expect(resolved).toMatchObject({
      kind: "update",
      contributionId: "canvas.agent-context.visibility",
      canonicalId: "canvas.visibility",
      description: "open surfaces",
      schema,
      materialize,
    });
    expect("hasValue" in resolved).toBe(false);
  });

  it("does not add live queue state to a resolved append contribution", () => {
    const resolved = resolveAgentContextContribution("game", {
      name: "moves",
      description: "pending moves",
      buffer: { kind: "append", schema: Type.String() },
    });

    expect(resolved.kind).toBe("append");
    expect("values" in resolved).toBe(false);
    expect("inFlight" in resolved).toBe(false);
  });

  it("preserves a materialized contribution without adding live state", () => {
    const materialize = (): { content: string } => ({ content: "changed" });
    const resolved = resolveAgentContextContribution("canvas", {
      name: "canvas-diff",
      description: "human edits",
      materialize,
    });

    expect(resolved).toMatchObject({
      kind: "materialized",
      contributionId: "canvas.agent-context.canvas-diff",
      canonicalId: "canvas.canvas-diff",
      description: "human edits",
      materialize,
    });
  });
});
