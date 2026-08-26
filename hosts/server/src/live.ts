// Defines the server live transport's accepted-connection handshake frame.

import { Type } from "typebox";
import { Value } from "typebox/value";

const LiveReadyFrameSchema = Type.Object(
  {
    type: Type.Literal("ready"),
    sessionId: Type.String({ minLength: 1 }),
    canonicalPath: Type.String({ minLength: 1, pattern: "^/" }),
  },
  { additionalProperties: false },
);

export interface LiveReadyFrame {
  readonly type: "ready";
  readonly sessionId: string;
  readonly canonicalPath: string;
}

/** Validate the first server frame that accepts a live session target. */
export function parseLiveReadyFrame(value: unknown): LiveReadyFrame {
  return Value.Parse(LiveReadyFrameSchema, value);
}

/** Encode one accepted live target and its canonical browser path. */
export function createLiveReadyFrame(
  sessionId: string,
  canonicalPath: string,
): LiveReadyFrame {
  return Value.Parse(LiveReadyFrameSchema, {
    type: "ready",
    sessionId,
    canonicalPath,
  });
}
