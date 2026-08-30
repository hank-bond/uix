import { describe, expect, it, vi } from "vitest";

import {
  forwardCanvasIframeMessage,
  isCanvasIframeReady,
  parseCanvasIframeMessage,
} from "./iframe-messages";
import { parseCanvasKey } from "../shared/addressing";

const main = parseCanvasKey("main");

describe("canvas iframe messages", () => {
  it("accepts readiness only from the current Canvas key", () => {
    expect(
      isCanvasIframeReady({ type: "canvas:ready", key: "main" }, main),
    ).toBe(true);
    expect(
      isCanvasIframeReady({ type: "canvas:ready", key: "other" }, main),
    ).toBe(false);
  });

  it("accepts a prompt carrying the current hydrated document", () => {
    expect(
      parseCanvasIframeMessage(
        {
          type: "canvas:prompt",
          key: "main",
          html: "<html><body>choice b</body></html>",
          prompt: "  Respond to my choices  ",
        },
        main,
      ),
    ).toEqual({
      type: "prompt",
      key: "main",
      html: "<html><body>choice b</body></html>",
      prompt: "Respond to my choices",
    });
  });

  it("rejects malformed, empty, and wrong-canvas prompt messages", () => {
    expect(
      parseCanvasIframeMessage(
        {
          type: "canvas:prompt",
          key: "other",
          html: "<html></html>",
          prompt: "respond",
        },
        main,
      ),
    ).toBeUndefined();
    expect(
      parseCanvasIframeMessage(
        {
          type: "canvas:prompt",
          key: "main",
          html: "<html></html>",
          prompt: "   ",
        },
        main,
      ),
    ).toBeUndefined();
    expect(
      parseCanvasIframeMessage(
        {
          type: "canvas:prompt",
          key: "main",
          html: "",
          prompt: "respond",
        },
        main,
      ),
    ).toBeUndefined();
  });

  it("finishes writeback before prompting the agent", async () => {
    const order: string[] = [];
    const writeback = vi.fn(() => {
      order.push("writeback");
      return Promise.resolve();
    });
    const prompt = vi.fn((_request: { text: string; mutationId: string }) => {
      order.push("prompt");
      return Promise.resolve();
    });

    await forwardCanvasIframeMessage(
      {
        type: "prompt",
        key: main,
        html: "<html></html>",
        prompt: "respond",
      },
      () => true,
      writeback,
      prompt,
    );

    expect(order).toEqual(["writeback", "prompt"]);
    expect(writeback).toHaveBeenCalledWith({
      key: "main",
      html: "<html></html>",
    });
    expect(prompt).toHaveBeenCalledOnce();
    const promptRequest = prompt.mock.calls[0][0];
    expect(promptRequest.text).toBe("respond");
    expect(promptRequest.mutationId).toEqual(expect.stringMatching(/.+/));
  });

  it("does not prompt when persisting the prompt state fails", async () => {
    const prompt = vi.fn(() => Promise.resolve());

    await expect(
      forwardCanvasIframeMessage(
        {
          type: "prompt",
          key: main,
          html: "<html></html>",
          prompt: "respond",
        },
        () => true,
        () => Promise.reject(new Error("writeback failed")),
        prompt,
      ),
    ).rejects.toThrow("writeback failed");

    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not prompt for an ordinary writeback", async () => {
    const writeback = vi.fn(() => Promise.resolve());
    const prompt = vi.fn(() => Promise.resolve());

    await forwardCanvasIframeMessage(
      {
        type: "writeback",
        key: main,
        html: "<html></html>",
      },
      () => true,
      writeback,
      prompt,
    );

    expect(writeback).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("drops stale iframe work before writeback and between writeback and prompt", async () => {
    let current = false;
    const writeback = vi.fn(() => Promise.resolve());
    const prompt = vi.fn(() => Promise.resolve());
    const message = {
      type: "prompt" as const,
      key: main,
      html: "<html></html>",
      prompt: "respond",
    };

    await forwardCanvasIframeMessage(message, () => current, writeback, prompt);
    expect(writeback).not.toHaveBeenCalled();

    current = true;
    writeback.mockImplementation(() => {
      current = false;
      return Promise.resolve();
    });
    await forwardCanvasIframeMessage(message, () => current, writeback, prompt);

    expect(writeback).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
  });
});
