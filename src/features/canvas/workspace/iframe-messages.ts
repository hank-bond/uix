// Validates Canvas iframe postMessage payloads and forwards writeback and prompt actions.

import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

import { createClientMutationId } from "@uix/api/agent-channels";

import { type CanvasKey, CanvasKeySchema } from "../shared/addressing";

const CanvasIframeMessageSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("canvas:writeback"),
      key: CanvasKeySchema,
      html: Type.String({ minLength: 1 }),
    },
    { additionalProperties: true },
  ),
  Type.Object(
    {
      type: Type.Literal("canvas:prompt"),
      key: CanvasKeySchema,
      html: Type.String({ minLength: 1 }),
      prompt: Type.String({ pattern: "\\S" }),
    },
    { additionalProperties: true },
  ),
]);
type CanvasIframeMessage = Static<typeof CanvasIframeMessageSchema>;

/** Validate the narrow postMessage vocabulary accepted from canvas HTML. */
export function asCanvasIframeMessage(
  value: unknown,
  canvasKey: CanvasKey,
): CanvasIframeMessage | undefined {
  if (
    !Value.Check(CanvasIframeMessageSchema, value) ||
    value.key !== canvasKey
  ) {
    return undefined;
  }
  return value.type === "canvas:prompt"
    ? {
        type: value.type,
        key: value.key,
        html: value.html,
        prompt: value.prompt.trim(),
      }
    : { type: value.type, key: value.key, html: value.html };
}

/**
 * Persist a prompt action's hydrated canvas before starting the agent turn.
 * This ordering lets submit preparation diff against the state visible at the
 * instant the human clicked the canvas action. Recheck the viewpoint after
 * writeback so an intervening session change cannot prompt the new target.
 */
export async function forwardCanvasIframeMessage(
  message: CanvasIframeMessage,
  isCurrentViewpoint: () => boolean,
  writebackHandler: (req: { key: CanvasKey; html: string }) => Promise<void>,
  promptHandler: (req: {
    text: string;
    mutationId: string;
  }) => Promise<unknown>,
): Promise<void> {
  if (!isCurrentViewpoint()) return;
  await writebackHandler({ key: message.key, html: message.html });
  if (message.type === "canvas:prompt" && isCurrentViewpoint()) {
    await promptHandler({
      text: message.prompt,
      mutationId: createClientMutationId(),
    });
  }
}
