import { describe, expect, it } from "vitest";

import { canonicalizeHtml } from "./normalize";

describe("canonicalizeHtml", () => {
  it("normalizes tag case, attribute quoting, and entities", () => {
    const out = canonicalizeHtml(
      "<body><DIV class=foo>Hi &amp; bye</DIV></body>",
    );
    expect(out).toContain('<div class="foo">');
    expect(out).toContain("Hi &amp; bye");
  });

  it("is idempotent", () => {
    const once = canonicalizeHtml("<body>\n<p>a</p>\n<p>b</p>\n</body>");
    expect(canonicalizeHtml(once)).toBe(once);
  });

  it("preserves author newlines so lines stay individually addressable", () => {
    const out = canonicalizeHtml("<body>\n<p>a</p>\n<p>b</p>\n</body>");
    expect(out.split("\n")).toContain("<p>a</p>");
    expect(out.split("\n")).toContain("<p>b</p>");
  });
});
