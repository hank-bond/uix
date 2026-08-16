import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorChatBlock } from "./ErrorChatBlock";

describe("agent error chat rendering", () => {
  it("uses the compact tool-error summary language without a disclosure", () => {
    const html = renderToStaticMarkup(
      <ErrorChatBlock
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
