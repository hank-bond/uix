import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToolCallDisclosure } from "./content/ToolCallDisclosure";
import type { ToolItem } from "./presentation";
import {
  deriveToolChatBlockPresentation,
  type ToolChatBlockPresentation,
} from "./presentations";
import type { BlockPresentationSettings } from "../../../shared/settings";

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
      payload: "a1§<main></main>",
    },
    ...overrides,
  };
}

const defaultSettings: BlockPresentationSettings = {
  command: { layout: "literal" },
  toolParams: {},
};

function derive(
  value: ToolItem,
  settings: BlockPresentationSettings = defaultSettings,
  label = "Read Canvas",
): ToolChatBlockPresentation {
  return deriveToolChatBlockPresentation(value, "success", label, settings);
}

describe("deriveToolChatBlockPresentation", () => {
  it("uses the provided label and the reason as the description", () => {
    const { summary } = derive(item());

    expect(summary.label).toBe("Read Canvas");
    expect(summary.description).toBe("I need to see the current canvas.");
  });

  it("surfaces non-content args as params, defaulting to all collapsed", () => {
    const { summary } = derive(item());

    // `payload` is consumed as expanded content by the canvas policy.
    expect(summary.collapsedParams).toEqual([{ key: "key", value: "main" }]);
    expect(summary.expandedParams).toEqual([]);
  });

  it("accepts a `description` arg as the description field", () => {
    const { summary } = derive(
      item({ args: { key: "main", description: "Looking at the canvas." } }),
    );

    expect(summary.description).toBe("Looking at the canvas.");
  });

  it("moves params hidden by settings into the expanded view", () => {
    const { summary } = derive(item(), {
      command: { layout: "literal" },
      toolParams: {
        canvas__anchor_read: { collapsed: [] },
      },
    });

    expect(summary.collapsedParams).toEqual([]);
    expect(summary.expandedParams).toEqual([{ key: "key", value: "main" }]);
  });

  it("keeps the surfaceable param list in call order regardless of visibility", () => {
    const { summary } = derive(
      item({
        toolName: "command",
        args: { command: "npm test", timeout: 30, reason: "Verifying." },
      }),
      {
        command: { layout: "literal" },
        toolParams: { command: { collapsed: ["timeout"] } },
      },
      "command",
    );

    // The settings list keeps arg order even though only `timeout` is shown.
    expect(summary.surfaceableParams).toEqual([
      { key: "command", value: "npm test" },
      { key: "timeout", value: "30" },
    ]);
    expect(summary.collapsedParams).toEqual([{ key: "timeout", value: "30" }]);
    expect(summary.expandedParams).toEqual([
      { key: "command", value: "npm test" },
    ]);
  });

  it("shows every non-description arg for unknown tools", () => {
    const { summary, part, content } = derive(
      item({
        toolName: "custom_tool",
        args: { query: "hello", reason: "Searching." },
        result: { content: [{ type: "text", text: "found it" }] },
      }),
      defaultSettings,
      "Custom Tool",
    );

    expect(summary.label).toBe("Custom Tool");
    expect(summary.description).toBe("Searching.");
    expect(summary.collapsedParams).toEqual([{ key: "query", value: "hello" }]);
    expect(part).toBe("tool");
    expect(renderToStaticMarkup(content)).toContain(
      'data-block-part="tool-payload"',
    );
  });

  it("renders expanded params as label:value rows in the disclosure", () => {
    const { summary } = derive(item(), {
      command: { layout: "literal" },
      toolParams: {
        canvas__anchor_read: { collapsed: [] },
      },
    });
    const html = renderToStaticMarkup(
      <ToolCallDisclosure
        label={summary.label}
        description={summary.description}
        params={summary.collapsedParams}
        expandedParams={summary.expandedParams}
        state="success"
        part="canvas-tool"
      />,
    );

    expect(html).toContain('data-block-part="tool-params"');
    expect(html).toContain('class="tool-call__param-key">key</span>');
    expect(html).toContain("main");
    expect(html).not.toContain("waiting for result");
  });
});
