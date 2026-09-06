import { describe, expect, it } from "vitest";

import { CanvasDocumentBuffer } from "./document-buffer";
import { toCanvasDocumentHtml } from "./document-html";
import { canonicalizeHtml } from "./html-canonicalization";
import { parseCanvasKey } from "../shared/addressing";

const key = parseCanvasKey("reports/main");

describe("Canvas document HTML", () => {
  it("inserts only the self-removing shim before authored head content", () => {
    const html = canonicalizeHtml(
      '<!doctype html><!-- <head> -->\n<html><head>\n<style>p { color: red; }</style></head><body>\n<a href="#details">Details</a><script>const text = "<head>";</script>\n</body></html>',
    );
    const served = toCanvasDocumentHtml(html, key);
    const start = served.indexOf("<script>");
    const end = served.indexOf("</script>", start) + "</script>".length;
    expect(served.slice(0, start) + served.slice(end)).toBe(html);
    expect(served).toContain('var KEY = "reports/main"');
    expect(served).toContain("if (self) self.remove()");
    expect(served.indexOf("canvas:writeback")).toBeLessThan(
      served.indexOf("<style>"),
    );
  });

  it("never puts served markup into buffer reads or persisted current content", async () => {
    let current: string | null = null;
    using buffer = new CanvasDocumentBuffer({
      getCurrent: () => Promise.resolve(current),
      setCurrent: (_id, html) => {
        current = html;
        return Promise.resolve();
      },
      createSnapshot: () => {
        throw new Error("Unused snapshot");
      },
      getVersion: () => Promise.resolve(null),
    });
    const authored = canonicalizeHtml("<p>Authored</p>");
    await buffer.write(key, authored);
    expect(toCanvasDocumentHtml(await buffer.readHtml(key), key)).toContain(
      "canvas:writeback",
    );
    expect(await buffer.readHtml(key)).toBe(authored);
    expect((await buffer.read(key)).map(({ text }) => text).join("\n")).toBe(
      authored,
    );
    expect(current).toBe(authored);
    await expect(buffer.writeback(key, '<base href="/">')).rejects.toThrow(
      "<base href>",
    );
    expect(await buffer.readHtml(key)).toBe(authored);
    expect(current).toBe(authored);
  });
});
