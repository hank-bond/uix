import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ToolItem } from "./tool";
import { FileToolContent } from "./FileToolContent";

function item(overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: "entry:tool:call",
    kind: "tool",
    toolCallId: "call",
    toolName: "read",
    cwd: "/workspace",
    complete: true,
    args: {
      path: "src/main.ts",
      reason: "I need to inspect the entry point.",
    },
    result: { content: [{ type: "text", text: "export {};" }] },
    ...overrides,
  };
}

describe("FileToolContent", () => {
  it("shows a derived path and reason while keeping file content disclosed", () => {
    const html = renderToStaticMarkup(
      <FileToolContent
        item={item({
          file: {
            absolutePath: "/workspace/src/main.ts",
            displayPath: "src/main.ts",
          },
        })}
      />,
    );

    expect(html).toContain("src/main.ts");
    expect(html).toContain("I need to inspect the entry point.");
    expect(html).toContain("<details");
    expect(html).toContain("<summary>result</summary>");
    expect(html.indexOf("export {};")).toBeGreaterThan(
      html.indexOf("<details"),
    );
  });

  it("falls back to ordinary tool rendering without a compatible reason", () => {
    const html = renderToStaticMarkup(
      <FileToolContent
        item={item({
          args: { path: "src/main.ts" },
        })}
      />,
    );

    expect(html).toContain('data-uix-part="tool-payload"');
    expect(html).toContain('data-uix-part="tool-details"');
    expect(html).not.toContain('data-uix-part="file-tool"');
  });

  it("puts write content behind the disclosure", () => {
    const html = renderToStaticMarkup(
      <FileToolContent
        item={item({
          toolName: "write",
          args: {
            path: "src/main.ts",
            content: "const value = 1;",
            reason: "I need to create the entry point.",
          },
          result: {
            content: [{ type: "text", text: "Successfully wrote 16 bytes" }],
          },
        })}
      />,
    );

    expect(html).toContain("<summary>content</summary>");
    expect(html.indexOf("const value = 1;")).toBeGreaterThan(
      html.indexOf("<details"),
    );
    expect(html).not.toContain("Successfully wrote 16 bytes");
  });
});
