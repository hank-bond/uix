import { describe, expect, it, vi } from "vitest";

import {
  asCanvasIframeMessage,
  forwardCanvasIframeMessage,
} from "./iframe-messages";
import { parseCanvasKey } from "../shared/addressing";

const main = parseCanvasKey("main");

describe("canvas iframe messages", () => {
  it("accepts a prompt carrying the current hydrated document", () => {
    expect(
      asCanvasIframeMessage(
        {
          type: "canvas:prompt",
          key: "main",
          html: "<html><body>choice b</body></html>",
          prompt: "  Respond to my choices  ",
        },
        main,
      ),
    ).toEqual({
      type: "canvas:prompt",
      key: "main",
      html: "<html><body>choice b</body></html>",
      prompt: "Respond to my choices",
    });
  });

  it("rejects malformed, empty, and wrong-canvas prompt messages", () => {
    expect(
      asCanvasIframeMessage(
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
      asCanvasIframeMessage(
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
      asCanvasIframeMessage(
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

  it.each([
    null,
    [],
    "message",
    {},
    { type: "canvas:writeback", key: "main", html: 1 },
    { type: "canvas:writeback", key: "main", html: "" },
    { type: "canvas:writeback", key: "Bad", html: "<p>Hi</p>" },
    { type: "canvas:prompt", key: "main", html: "<p>Hi</p>", prompt: 1 },
    { type: "canvas:prompt", key: "main", html: "<p>Hi</p>", prompt: "\n\t " },
    { type: "unknown", key: "main", html: "<p>Hi</p>" },
  ])("rejects unsupported message structure: %j", (value) => {
    expect(asCanvasIframeMessage(value, main)).toBeUndefined();
  });

  it("accepts writeback and drops additional fields without mutating input", () => {
    const input = {
      type: "canvas:writeback",
      key: "main",
      html: "<p>Hi</p>",
      extra: true,
    };
    expect(asCanvasIframeMessage(input, main)).toEqual({
      type: "canvas:writeback",
      key: main,
      html: input.html,
    });
    expect(input.extra).toBe(true);
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
        type: "canvas:prompt",
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
          type: "canvas:prompt",
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
        type: "canvas:writeback",
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
    let isCurrent = false;
    const writeback = vi.fn(() => Promise.resolve());
    const prompt = vi.fn(() => Promise.resolve());
    const message = {
      type: "canvas:prompt" as const,
      key: main,
      html: "<html></html>",
      prompt: "respond",
    };

    await forwardCanvasIframeMessage(
      message,
      () => isCurrent,
      writeback,
      prompt,
    );
    expect(writeback).not.toHaveBeenCalled();

    isCurrent = true;
    writeback.mockImplementation(() => {
      isCurrent = false;
      return Promise.resolve();
    });
    await forwardCanvasIframeMessage(
      message,
      () => isCurrent,
      writeback,
      prompt,
    );

    expect(writeback).toHaveBeenCalledOnce();
    expect(prompt).not.toHaveBeenCalled();
  });
});
