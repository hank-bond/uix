// Validates Canvas iframe postMessage payloads and forwards writeback and prompt actions.

import { createClientMutationId } from "@uix/api/agent-channels";

import type { CanvasKey } from "../shared/addressing";

export type CanvasIframeMessage =
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

export function isCanvasIframeReady(
  value: unknown,
  canvasKey: CanvasKey,
): boolean {
  return (
    isRecord(value) &&
    value["type"] === "canvas:ready" &&
    value["key"] === canvasKey
  );
}

/** Validate the narrow postMessage vocabulary accepted from canvas HTML. */
export function parseCanvasIframeMessage(
  value: unknown,
  canvasKey: CanvasKey,
): CanvasIframeMessage | undefined {
  if (!isRecord(value) || value["key"] !== canvasKey) return undefined;

  const html = value["html"];
  if (typeof html !== "string" || html === "") return undefined;

  if (value["type"] === "canvas:writeback") {
    return { type: "writeback", key: canvasKey, html };
  }

  if (value["type"] === "canvas:prompt") {
    const prompt = value["prompt"];
    if (typeof prompt !== "string" || prompt.trim() === "") return undefined;
    return { type: "prompt", key: canvasKey, html, prompt: prompt.trim() };
  }

  return undefined;
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
  writeback: (req: { key: CanvasKey; html: string }) => Promise<void>,
  prompt: (req: { text: string; mutationId: string }) => Promise<unknown>,
): Promise<void> {
  if (!isCurrentViewpoint()) return;
  await writeback({ key: message.key, html: message.html });
  if (message.type === "prompt" && isCurrentViewpoint()) {
    await prompt({
      text: message.prompt,
      mutationId: createClientMutationId(),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
