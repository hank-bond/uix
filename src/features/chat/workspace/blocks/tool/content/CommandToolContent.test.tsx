import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToolChatBlock } from "../../ToolChatBlock";
import type { ToolItem } from "../presentation";

function item(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: "entry:tool:call",
    kind: "tool",
    toolCallId: "call",
    toolName: "command",
    cwd: "/workspace",
    complete: true,
    args: {
      command: "npm test",
      reason: "I need to verify the changes.",
    },
    result: { content: [{ type: "text", text: "Tests passed" }] },
    ...overrides,
  };
}

describe("command tool chat rendering", () => {
  it("shows only the reason in the collapsed row and discloses command and output", () => {
    const html = renderToStaticMarkup(<ToolChatBlock item={item()} />);

    expect(html).toContain("command: ");
    expect(html).toContain("I need to verify the changes.");
    expect(html).not.toContain("tool: ");
    expect(html).toContain('<details class="tool-block__details"');
    expect(html).toContain("<summary>command and output</summary>");
    expect(html).toContain('data-language="bash"');
    expect(html.indexOf("npm")).toBeGreaterThan(html.indexOf("<details"));
    expect(html.indexOf("Tests passed")).toBeGreaterThan(
      html.indexOf("<details"),
    );
  });

  it("shows streamed output inside the disclosure", () => {
    const html = renderToStaticMarkup(
      <ToolChatBlock
        item={item({
          complete: false,
          result: undefined,
          partialResult: {
            content: [{ type: "text", text: "Building…" }],
          },
        })}
      />,
    );

    expect(html).toContain("Building…");
    expect(html.indexOf("Building…")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain('aria-label="Tool running"');
  });

  it("falls back to ordinary tool rendering without a compatible reason", () => {
    const html = renderToStaticMarkup(
      <ToolChatBlock
        item={item({
          args: { command: "npm test" },
        })}
      />,
    );

    expect(html).toContain("tool: ");
    expect(html).toContain('data-uix-part="tool-payload"');
    expect(html).not.toContain('data-uix-part="command-tool"');
  });
});
