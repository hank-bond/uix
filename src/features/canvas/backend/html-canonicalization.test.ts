import { describe, expect, it } from "vitest";

import { canonicalizeHtml } from "./html-canonicalization";

describe("canonicalizeHtml", () => {
  it("normalizes tag case, attribute quoting, and entities", () => {
    const out = canonicalizeHtml(
      "<body><DIV class=foo>Hi &amp; bye</DIV></body>",
    );
    expect(out).toContain('<div class="foo">');
    expect(out).toContain("Hi &amp; bye");
  });

  it.each([
    '<base href="/">',
    '<BASE HREF="https://example.com/">',
    '<body><base href=""></body>',
    '<template><base href="assets/"></template>',
  ])("rejects authored bases: %s", (html) => {
    expect(() => canonicalizeHtml(html)).toThrow("<base href>");
  });

  it("allows base targets and base-like text without changing relative links", () => {
    const html =
      '<base target="_blank"><script>const text = "<base href=/>";</script><a href="#details">Details</a>';
    const canonical = canonicalizeHtml(html);
    expect(canonical).toContain('<base target="_blank">');
    expect(canonical).toContain('const text = "<base href=/>";');
    expect(canonical).toContain('<a href="#details">Details</a>');
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
