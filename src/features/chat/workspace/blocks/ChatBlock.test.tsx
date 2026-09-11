import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatBlock } from "./ChatBlock";

describe("thinking placeholders", () => {
  const item = {
    id: "live:assistant",
    kind: "assistant" as const,
    text: "",
    complete: false,
  };

  it("shows a placeholder only while the empty row is actively thinking", () => {
    expect(
      renderToStaticMarkup(<ChatBlock item={item} showThinking />),
    ).toContain("…");
    expect(renderToStaticMarkup(<ChatBlock item={item} />)).toBe("");
  });

  it("removes completed empty rows, including whitespace-only messages", () => {
    for (const text of ["", " \n"]) {
      expect(
        renderToStaticMarkup(
          <ChatBlock item={{ ...item, text, complete: true }} showThinking />,
        ),
      ).toBe("");
    }
  });

  it("replaces the placeholder with text as soon as it arrives", () => {
    const html = renderToStaticMarkup(
      <ChatBlock
        item={{ ...item, text: "Here is the answer." }}
        showThinking
      />,
    );
    expect(html).toContain("Here is the answer.");
    expect(html).not.toContain("…");
  });
});

describe("agent error chat rendering", () => {
  it("uses the compact tool-error summary language without a disclosure", () => {
    const html = renderToStaticMarkup(
      <ChatBlock
        item={{
          id: "entry:error",
          kind: "error",
          message: "Authentication failed",
        }}
      />,
    );

    expect(html).toContain('aria-label="Agent error"');
    expect(html).toContain('data-block-state="error"');
    expect(html).toContain('class="block-status-row"');
    expect(html).toContain('class="block-status-row__label">agent</span>');
    expect(html).toContain("Authentication failed");
    expect(html).toContain('class="block-status-row__state">error</span>');
    expect(html).not.toContain("tool-call__");
    expect(html).toContain("Agent failed");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<summary");
  });
});
