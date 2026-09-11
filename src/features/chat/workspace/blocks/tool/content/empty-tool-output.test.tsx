import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FeatureSettingsProvider } from "@uix/api/workspace";

import { defaultBlockPresentationSettings } from "../../../../shared/settings";
import { BlockPresentationSettingsProvider } from "../../BlockPresentationSettings";
import type { ToolItem } from "../call-presentation";
import { deriveToolChatBlockPresentation } from "../chat-block-presentation";

function render(toolName: string, overrides: Partial<ToolItem> = {}): string {
  const item: ToolItem = {
    id: "tool:empty",
    kind: "tool",
    toolCallId: "empty",
    toolName,
    cwd: "/workspace",
    complete: true,
    args: { path: "empty.txt", command: "true", reason: "Check empty output." },
    result: { content: [{ type: "text", text: "" }] },
    ...overrides,
  };
  const { content } = deriveToolChatBlockPresentation(
    item,
    item.complete ? "success" : "running",
    toolName,
    defaultBlockPresentationSettings,
  );
  return renderToStaticMarkup(
    <FeatureSettingsProvider
      client={{
        get: () => Promise.resolve(undefined),
        set: () => Promise.resolve(),
        onChange: () => () => {},
      }}
    >
      <BlockPresentationSettingsProvider>
        {content}
      </BlockPresentationSettingsProvider>
    </FeatureSettingsProvider>,
  );
}

describe("empty tool output", () => {
  it.each(["read", "edit", "shell", "canvas__anchor_read", "custom_tool"])(
    "shows No output for a completed empty %s result, not its content-block JSON",
    (toolName) => {
      const html = render(toolName);
      expect(html).toContain('class="tool-call__empty">No output</span>');
      expect(html).not.toContain("&quot;type&quot;");
      expect(html).not.toContain("&quot;text&quot;");
    },
  );

  it("labels an empty write payload as content, not output", () => {
    expect(
      render("write", { args: { path: "empty.txt", content: "" } }),
    ).toContain("Empty content");
  });

  it.each(["read", "edit", "shell", "canvas__anchor_read", "custom_tool"])(
    "does not mistake an incomplete %s result for completed empty output",
    (toolName) => {
      const html = render(toolName, {
        complete: false,
        result: undefined,
        partialResult: { content: [{ type: "text", text: "" }] },
      });
      expect(html).not.toContain("No output");
    },
  );

  it("keeps JSON fallback for unrecognized structured content", () => {
    expect(render("read", { result: { content: [{ count: 2 }] } })).toContain(
      "&quot;count&quot;: 2",
    );
  });
});
