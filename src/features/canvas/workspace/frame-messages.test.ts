import { describe, expect, it, vi } from "vitest";

import { parseCanvasKey } from "../shared/addressing";

import {
  forwardCanvasFrameMessage,
  parseCanvasFrameMessage,
} from "./frame-messages";

const main = parseCanvasKey("main");

describe("canvas frame messages", () => {
  it("accepts a prompt carrying the current hydrated document", () => {
    expect(
      parseCanvasFrameMessage(
        {
          type: "uix:canvas-prompt",
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
      parseCanvasFrameMessage(
        {
          type: "uix:canvas-prompt",
          key: "other",
          html: "<html></html>",
          prompt: "respond",
        },
        main,
      ),
    ).toBeUndefined();
    expect(
      parseCanvasFrameMessage(
        {
          type: "uix:canvas-prompt",
          key: "main",
          html: "<html></html>",
          prompt: "   ",
        },
        main,
      ),
    ).toBeUndefined();
    expect(
      parseCanvasFrameMessage(
        {
          type: "uix:canvas-prompt",
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
    const prompt = vi.fn(() => {
      order.push("prompt");
      return Promise.resolve();
    });

    await forwardCanvasFrameMessage(
      {
        type: "prompt",
        key: main,
        html: "<html></html>",
        prompt: "respond",
      },
      writeback,
      prompt,
    );

    expect(order).toEqual(["writeback", "prompt"]);
    expect(writeback).toHaveBeenCalledWith({
      key: "main",
      html: "<html></html>",
    });
    expect(prompt).toHaveBeenCalledWith({ text: "respond" });
  });

  it("does not prompt when persisting the prompt state fails", async () => {
    const prompt = vi.fn(() => Promise.resolve());

    await expect(
      forwardCanvasFrameMessage(
        {
          type: "prompt",
          key: main,
          html: "<html></html>",
          prompt: "respond",
        },
        () => Promise.reject(new Error("writeback failed")),
        prompt,
      ),
    ).rejects.toThrow("writeback failed");

    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not prompt for an ordinary writeback", async () => {
    const writeback = vi.fn(() => Promise.resolve());
    const prompt = vi.fn(() => Promise.resolve());

    await forwardCanvasFrameMessage(
      {
        type: "writeback",
        key: main,
        html: "<html></html>",
      },
      writeback,
      prompt,
    );

    expect(writeback).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
  });
});
