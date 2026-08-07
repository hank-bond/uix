import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CanvasToolContent,
  tryParseCanvasToolPresentation,
} from "./CanvasToolContent";
import { ToolChatBlock } from "../../ToolChatBlock";
import type { ToolItem } from "../presentation";

function item(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: "entry:tool:call",
    kind: "tool",
    toolCallId: "call",
    toolName: "canvas__anchor_read",
    cwd: "/workspace",
    complete: true,
    args: {
      key: "main",
      reason: "I need to see the current canvas.",
    },
    result: {
      content: [
        {
          type: "text",
          text: "a1§<main></main>\na2§<p>hello</p>",
        },
      ],
    },
    ...overrides,
  };
}

function renderCanvasContent(value: ToolItem): string {
  const presentation = tryParseCanvasToolPresentation(value);
  if (!presentation) {
    throw new Error("test item must parse a canvas presentation");
  }
  return renderToStaticMarkup(
    <CanvasToolContent
      item={value}
      state="success"
      presentation={presentation}
    />,
  );
}

describe("CanvasToolContent", () => {
  it("shows a display name, reason, and key with the payload disclosed", () => {
    const html = renderCanvasContent(item());

    expect(html).toContain('class="tool-call__name">Read Canvas</span>');
    expect(html).toContain("I need to see the current canvas.");
    expect(html).toContain('data-uix-part="tool-target"');
    expect(html).toContain("main");
    expect(html).toContain('<details class="tool-call"');
    expect(html).toContain('data-uix-part="canvas-tool-payload"');
    expect(html).not.toContain("tool: ");
    expect(html).not.toContain("a1§");
    expect(html).toContain("&lt;main&gt;&lt;/main&gt;");
  });

  it("falls back to ordinary tool rendering without a canvas key", () => {
    const html = renderToStaticMarkup(
      <ToolChatBlock
        item={item({
          args: { reason: "I need to see the current canvas." },
        })}
      />,
    );

    expect(html).toContain('data-uix-part="tool-payload"');
    expect(html).not.toContain('data-uix-part="canvas-tool"');
  });
});
