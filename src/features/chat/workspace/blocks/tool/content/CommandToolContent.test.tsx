import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureSettingsProvider } from "@uix/api/workspace";

import { BlockPresentationSettingsProvider } from "../../BlockPresentationSettings";
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

function renderCommandItem(value: ToolItem): string {
  return renderToStaticMarkup(
    <FeatureSettingsProvider
      client={{
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
        onChange: () => () => {},
      }}
    >
      <BlockPresentationSettingsProvider>
        <ToolChatBlock item={value} />
      </BlockPresentationSettingsProvider>
    </FeatureSettingsProvider>,
  );
}

describe("command tool chat rendering", () => {
  it("shows a clickable name-and-reason row and discloses command and output", () => {
    const html = renderCommandItem(item());

    expect(html).toContain('class="tool-call__name">command</span>');
    expect(html).toContain("I need to verify the changes.");
    expect(html).not.toContain("tool: ");
    expect(html).toContain('<details class="tool-call"');
    expect(html).toContain('<summary class="tool-call__summary">');
    expect(html).not.toContain("command and output");
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

  it("falls back to ordinary tool rendering without a compatible reason", () => {
    const html = renderCommandItem(
      item({
        args: { command: "npm test" },
      }),
    );

    expect(html).toContain("tool: ");
    expect(html).toContain('data-uix-part="tool-payload"');
    expect(html).not.toContain('data-uix-part="command-tool"');
  });
});
