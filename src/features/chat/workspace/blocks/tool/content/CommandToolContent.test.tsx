import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureSettingsProvider } from "@uix/api/workspace";

import { StructuredCommand } from "./StructuredCommand";
import { BlockPresentationSettingsProvider } from "../../BlockPresentationSettings";
import { ToolChatBlock } from "../../ToolChatBlock";
import type { ToolItem } from "../presentation";
import { ToolLabelProvider } from "../tool-catalog";

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

function renderCommandItem(value: ToolItem): string {
  return renderToStaticMarkup(
    <FeatureSettingsProvider
      client={{
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
        onChange: () => () => {},
      }}
    >
      <ToolLabelProvider labelByToolName={new Map()}>
        <BlockPresentationSettingsProvider>
          <ToolChatBlock item={value} />
        </BlockPresentationSettingsProvider>
      </ToolLabelProvider>
    </FeatureSettingsProvider>,
  );
}

describe("command tool chat rendering", () => {
  it("shows a clickable label-and-reason row and discloses command and output", () => {
    const html = renderCommandItem(item());

    expect(html).toContain('class="tool-call__name">command</span>');
    expect(html).toContain("I need to verify the changes.");
    expect(html).toContain('class="tool-call__param-key">command</span>');
    expect(html).toContain("npm test");
    expect(html).not.toContain("tool: ");
    expect(html).toContain('<details class="tool-call"');
    expect(html).toContain('<summary class="tool-call__summary">');
    expect(html).not.toContain("structured-command");
    expect(html).toContain('data-language="bash"');
    expect(html.indexOf("npm")).toBeGreaterThan(html.indexOf("<details"));
    expect(html.indexOf("Tests passed")).toBeGreaterThan(
      html.indexOf("<details"),
    );
  });

  it("shows streamed output inside the disclosure", () => {
    const html = renderCommandItem(
      item({
        complete: false,
        result: undefined,
        partialResult: {
          content: [{ type: "text", text: "Building…" }],
        },
      }),
    );

    expect(html).toContain("Building…");
    expect(html.indexOf("Building…")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain('aria-label="Tool running"');
  });

  it("renders structured command pieces when the layout setting is structured", () => {
    const html = renderToStaticMarkup(
      <StructuredCommand
        command="npm test && npm run build"
        layout="structured"
      />,
    );

    expect(html).toContain('class="structured-command"');
    expect(html).toContain("structured-command__piece--source");
    expect(html).toContain("structured-command__piece--logical");
    expect(html).toContain("run build");
  });

  it("falls back to default content for unknown tools", () => {
    const html = renderCommandItem(
      item({
        toolName: "custom_tool",
        args: { query: "hello", reason: "I need to search." },
      }),
    );

    expect(html).toContain('data-block-part="tool-payload"');
    expect(html).toContain('data-block-part="tool-details"');
    expect(html).not.toContain('data-block-part="command-tool"');
    expect(html).toContain('class="tool-call__param-key">query</span>');
  });
});
