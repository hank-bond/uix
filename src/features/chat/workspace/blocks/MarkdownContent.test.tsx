import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders Markdown and GFM structures as semantic HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        text={`## Release notes

- first
- second

| File | State |
| --- | --- |
| chat.tsx | ~~pending~~ done |`}
      />,
    );

    expect(html).toContain("<h2>Release notes</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>pending</del> done");
  });

  it("renders external web links in a separate browsing context", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent text={"[UIX](https://uix.sh/docs)"} />,
    );

    expect(html).toContain(
      '<a href="https://uix.sh/docs" target="_blank" rel="noopener noreferrer">UIX</a>',
    );
  });

  it("renders unsupported link destinations as text", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent text={"[local file](file:///Users/work/secret.txt)"} />,
    );

    expect(html).toContain("<span>local file</span>");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("file://");
  });

  it("renders raw HTML as text", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent
        text={'before <button onclick="bad()">unsafe</button> after'}
      />,
    );

    expect(html).not.toContain("<button");
    expect(html).toContain(
      "before &lt;button onclick=&quot;bad()&quot;&gt;unsafe&lt;/button&gt; after",
    );
  });

  it("highlights registered fenced-code languages", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent text={"```ts\nconst value: number = 1;\n```"} />,
    );

    expect(html).toContain('class="language-ts"');
    expect(html).toContain('data-language="ts"');
    expect(html).toContain('class="token keyword"');
  });

  it("leaves unknown fenced-code languages as plain code", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent text={"```not-a-language\nplain text\n```"} />,
    );

    expect(html).toContain('class="language-not-a-language"');
    expect(html).not.toContain('class="token ');
  });
});
