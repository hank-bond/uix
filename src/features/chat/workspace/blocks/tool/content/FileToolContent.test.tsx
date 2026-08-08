import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureSettingsProvider } from "@uix/api/workspace";

import { BlockPresentationSettingsProvider } from "../../BlockPresentationSettings";
import { ToolChatBlock } from "../../ToolChatBlock";
import type { ToolItem } from "../presentation";
import { ToolLabelProvider } from "../tool-catalog";

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

function renderFileItem(value: ToolItem): string {
  return renderToStaticMarkup(
    <FeatureSettingsProvider
      client={{
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
        onChange: () => () => {},
      }}
    >
      <ToolLabelProvider
        labelByToolName={
          new Map([
            ["read", "read"],
            ["write", "write"],
          ])
        }
      >
        <BlockPresentationSettingsProvider>
          <ToolChatBlock item={value} />
        </BlockPresentationSettingsProvider>
      </ToolLabelProvider>
    </FeatureSettingsProvider>,
  );
}

describe("file tool chat rendering", () => {
  it("shows the path param and reason while keeping file content disclosed", () => {
    const html = renderFileItem(
      item({
        file: {
          absolutePath: "/workspace/src/main.ts",
          displayPath: "src/main.ts",
        },
      }),
    );

    expect(html).toContain("src/main.ts");
    expect(html).toContain("I need to inspect the entry point.");
    expect(html).toContain('<details class="tool-call"');
    expect(html).toContain('<pre class="code-block">');
    expect(html).toContain('<summary class="tool-call__summary">');
    expect(html).toContain('class="tool-call__section-label">result</span>');
    expect(html).toContain('data-language="typescript"');
    expect(html).toContain('class="token keyword"');
    expect(html.indexOf('class="token keyword">export</span>')).toBeGreaterThan(
      html.indexOf("<details"),
    );
  });

  it("leaves files with unknown extensions as literal plain text", () => {
    const html = renderFileItem(
      item({
        args: {
          path: "notes.unknown",
          reason: "I need to inspect the notes.",
        },
        result: { content: [{ type: "text", text: "<unsafe>" }] },
      }),
    );

    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain('class="token ');
  });

  it("surfaces write content only behind the disclosure", () => {
    const html = renderFileItem(
      item({
        toolName: "write",
        args: {
          path: "src/main.ts",
          content: "const value = 1;",
          reason: "I need to create the entry point.",
        },
        result: {
          content: [{ type: "text", text: "Successfully wrote 16 bytes" }],
        },
      }),
    );

    expect(html).toContain('class="tool-call__section-label">content</span>');
    expect(html).toContain("src/main.ts");
    // Content sits behind the disclosure, not in the summary row.
    expect(html.indexOf('class="token keyword">const</span>')).toBeGreaterThan(
      html.indexOf("<details"),
    );
    expect(html).not.toContain("Successfully wrote 16 bytes");
  });
});
