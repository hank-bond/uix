import { describe, expect, it } from "vitest";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  registerTurnStateContributions,
  toTurnStateRegistrySnapshot,
  TurnStateRegistry,
} from "../turn-state/registry";
import { deriveSelectedBranchProjection } from "./branch-projection";

function entry(value: Record<string, unknown>): SessionEntry {
  return value as unknown as SessionEntry;
}

describe("deriveSelectedBranchProjection", () => {
  it("derives the transcript and latest value per active cell as of the leaf", () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "canvas", {
      documents: {
        schema: Type.Record(Type.String(), Type.String()),
        createSnapshot: () => ({}),
        restore: () => undefined,
      },
      selection: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => undefined,
      },
    });

    const projection = deriveSelectedBranchProjection(
      [
        entry({
          id: "user-1",
          type: "message",
          message: { role: "user", content: "Hello" },
        }),
        entry({
          id: "state-1",
          type: "custom",
          customType: "uix.turn-state",
          data: {
            cwd: "/old",
            state: {
              "canvas.documents": { "doc://canvas/main": "version-1" },
              "retired.value": "ignored",
            },
          },
        }),
        entry({
          id: "assistant-1",
          type: "message",
          message: { role: "assistant", content: "Hi" },
        }),
        entry({
          id: "state-2",
          type: "custom",
          customType: "uix.turn-state",
          data: {
            cwd: "/current",
            state: { "canvas.selection": "anchor-2" },
          },
        }),
        entry({
          id: "state-3",
          type: "custom",
          customType: "uix.turn-state",
          data: {
            state: {
              "canvas.documents": { "doc://canvas/main": "version-2" },
            },
          },
        }),
      ],
      toTurnStateRegistrySnapshot(turnState),
    );

    expect(projection.transcript).toEqual({
      items: [
        { id: "user-1", kind: "user", text: "Hello" },
        {
          id: "assistant-1",
          kind: "assistant",
          text: "Hi",
          complete: true,
        },
      ],
    });
    expect([...projection.turnStateAsOfLeaf.latestValuePerCell]).toEqual([
      ["canvas.documents", { "doc://canvas/main": "version-2" }],
      ["canvas.selection", "anchor-2"],
    ]);
    expect(projection.turnStateAsOfLeaf.cwd).toBe("/current");
  });

  it("keeps missing active cells absent for later undefined restoration", () => {
    const turnState = new TurnStateRegistry();
    registerTurnStateContributions(turnState, "chat", {
      draft: {
        schema: Type.String(),
        createSnapshot: () => "",
        restore: () => undefined,
      },
    });

    const projection = deriveSelectedBranchProjection(
      [],
      toTurnStateRegistrySnapshot(turnState),
    );

    expect(projection.transcript).toEqual({ items: [] });
    expect([...projection.turnStateAsOfLeaf.latestValuePerCell.keys()]).toEqual(
      [],
    );
    expect(projection.turnStateAsOfLeaf.cwd).toBeUndefined();
  });
});
