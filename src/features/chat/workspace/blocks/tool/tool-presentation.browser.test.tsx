import { readFile } from "node:fs/promises";

import { chromium } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { toToolParams } from "./call-presentation";
import { FileToolContent } from "./content/FileToolContent";
import { ToolCallDisclosure } from "./content/ToolCallDisclosure";

it("keeps summaries above aligned params and wraps prose at wide and narrow widths", async () => {
  await using lifetime = new AsyncDisposableStack();
  const browser = await chromium.launch();
  lifetime.defer(() => browser.close());
  const page = await browser.newPage();
  const styles = await Promise.all(
    [
      "../BlockStatusRow.css",
      "./tool-content.css",
      "../content/CodeBlock.css",
      "./content/FileToolContent.css",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const text =
    "A long line of prose with spaces. ".repeat(20) + "x".repeat(180);
  const params = toToolParams({
    path: "notes.md",
    edits: [{ oldText: "first\nsecond", newText: "third\nfourth" }],
  });
  const markup = renderToStaticMarkup(
    <ToolCallDisclosure
      label="edit"
      description="Make the notes easier to read."
      params={params}
      expandedParams={[{ key: "timeout", value: "30" }]}
      state="success"
      part="file-tool"
    >
      {["read", "write", "edit"].flatMap((toolName) =>
        ["md", "txt", "ts"].map((extension) => (
          <div
            key={`${toolName}-${extension}`}
            data-fixture={`${toolName}-${extension}`}
          >
            <FileToolContent
              item={{
                id: `${toolName}-${extension}`,
                kind: "tool",
                toolCallId: "call",
                toolName,
                cwd: "/workspace",
                complete: true,
                args: { path: `notes.${extension}`, content: text },
                result: { content: [{ type: "text", text }] },
              }}
            />
          </div>
        )),
      )}
    </ToolCallDisclosure>,
  );
  await page.setContent(`<style>
    :root { --chat-text-meta: 12px; --chat-text-code: 13px; --chat-text-body: 14px; }
    .fixture { container: chat-surface / inline-size; font: 14px/1.5 sans-serif; }
    ${styles.join("\n")}
    </style><div class="fixture">${markup}</div>`);

  for (const width of [760, 320]) {
    await page.locator(".fixture").evaluate((element, width) => {
      (element as HTMLElement).style.width = `${String(width)}px`;
    }, width);
    const label = await page.locator(".block-status-row__label").boundingBox();
    const description = await page
      .locator(".block-status-row__description")
      .boundingBox();
    const collapsed = await page.locator(".tool-call__params").boundingBox();
    if (!label || !description || !collapsed)
      throw new Error("Missing summary layout");
    expect(description.y).toBe(label.y);
    const summary = await page.locator("summary").boundingBox();
    if (!summary) throw new Error("Missing summary");
    const padding = await page
      .locator("summary")
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft));
    expect(Math.abs(collapsed.x - summary.x - padding)).toBeLessThan(1);
    expect(collapsed.x).toBeLessThan(label.x);
    expect(collapsed.y).toBeGreaterThanOrEqual(
      description.y + description.height,
    );
    expect(
      await page.locator(".tool-call__param-value").nth(1).textContent(),
    ).toContain('"oldText": "first\nsecond"');
    expect(
      await page
        .locator(".tool-call__param-value")
        .nth(1)
        .evaluate((element) => getComputedStyle(element).whiteSpace),
    ).toBe("pre-wrap");

    await page.locator("summary").focus();
    await page.keyboard.press("Enter");
    expect(await page.locator("details").getAttribute("open")).not.toBeNull();
    const expanded = await page
      .locator(".tool-call__params-list")
      .boundingBox();
    if (!expanded) throw new Error("Missing expanded params");
    expect(Math.abs(expanded.x - collapsed.x)).toBeLessThan(1);
    expect(expanded.y).toBeGreaterThan(collapsed.y);

    for (const tool of ["read", "write", "edit"]) {
      for (const extension of ["md", "txt", "ts"]) {
        const code = page.locator(`[data-fixture="${tool}-${extension}"] pre`);
        const metrics = await code.evaluate((element) => ({
          wrap: getComputedStyle(element).whiteSpace,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent,
        }));
        expect(metrics.text).toBe(text);
        if (extension === "ts") {
          expect(metrics.wrap).toBe("pre");
          expect(metrics.scrollWidth).toBeGreaterThan(metrics.width);
        } else {
          expect(metrics.wrap).toBe("pre-wrap");
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
        }
      }
    }
    expect(
      await page
        .locator(".fixture")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.locator("summary").focus();
    await page.keyboard.press("Enter");
    expect(await page.locator("details").getAttribute("open")).toBeNull();
  }
});
