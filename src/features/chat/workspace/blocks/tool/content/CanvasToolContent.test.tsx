import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasToolContent } from "./CanvasToolContent";
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
  return renderToStaticMarkup(<CanvasToolContent item={value} />);
}

describe("CanvasToolContent", () => {
  it("renders the anchored payload preview with gutters stripped", () => {
    const html = renderCanvasContent(item());

    expect(html).toContain('data-uix-part="canvas-tool-payload"');
    expect(html).toContain('data-uix-part="tool-payload"');
    expect(html).toContain("&lt;main&gt;&lt;/main&gt;");
    expect(html).toContain("&lt;p&gt;hello&lt;/p&gt;");
    expect(html).not.toContain("a1§");
    expect(html).not.toContain("a2§");
  });

  it("offers a show-more toggle when the payload exceeds five lines", () => {
    const lines = Array.from(
      { length: 8 },
      (_, index) => `a${String(index + 1)}§line ${String(index + 1)}`,
    ).join("\n");
    const html = renderCanvasContent(
      item({
        result: { content: [{ type: "text", text: lines }] },
      }),
    );

    expect(html).toContain("show 3 more line");
    expect(html).not.toContain("line 7");
    expect(html).toContain("line 5");
  });

  it("renders nothing when there is no payload", () => {
    const html = renderCanvasContent(item({ result: undefined }));

    expect(html).not.toContain('data-uix-part="tool-payload"');
    expect(html).not.toContain("canvas-tool-toggle");
  });
});
