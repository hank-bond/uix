import type { CanvasKey } from "../shared/addressing";

export type CanvasFrameMessage =
  | {
      readonly type: "writeback";
      readonly key: CanvasKey;
      readonly html: string;
    }
  | {
      readonly type: "prompt";
      readonly key: CanvasKey;
      readonly html: string;
      readonly prompt: string;
    };

/** Validate the narrow postMessage vocabulary accepted from canvas HTML. */
export function parseCanvasFrameMessage(
  value: unknown,
  canvasKey: CanvasKey,
): CanvasFrameMessage | undefined {
  if (!isRecord(value) || value["key"] !== canvasKey) return undefined;

  const html = value["html"];
  if (typeof html !== "string" || html === "") return undefined;

  if (value["type"] === "uix:canvas-writeback") {
    return { type: "writeback", key: canvasKey, html };
  }

  if (value["type"] === "uix:canvas-prompt") {
    const prompt = value["prompt"];
    if (typeof prompt !== "string" || prompt.trim() === "") return undefined;
    return { type: "prompt", key: canvasKey, html, prompt: prompt.trim() };
  }

  return undefined;
}

/**
 * Persist a prompt action's hydrated canvas before starting the agent turn.
 * This ordering lets submit preparation diff against the state visible at the
 * instant the human clicked the canvas action.
 */
export async function forwardCanvasFrameMessage(
  message: CanvasFrameMessage,
  writeback: (req: { key: CanvasKey; html: string }) => Promise<void>,
  prompt: (req: { text: string }) => Promise<void>,
): Promise<void> {
  await writeback({ key: message.key, html: message.html });
  if (message.type === "prompt") {
    await prompt({ text: message.prompt });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
