import { chromium } from "playwright";
import { expect, it } from "vitest";

import { toCanvasDocumentHtml } from "./document-html";
import { canonicalizeHtml } from "./html-canonicalization";
import { parseCanvasKey } from "../shared/addressing";

interface FixtureWindow extends Window {
  fixtureMessages: unknown[];
}

it("ends shim listeners, timers, and the explicit trigger with the document lifetime", async () => {
  await using lifetime = new AsyncDisposableStack();
  const browser = await chromium.launch();
  lifetime.defer(() => browser.close());
  const page = await browser.newPage();
  await page.clock.install();
  await page.setContent(
    toCanvasDocumentHtml(
      canonicalizeHtml(
        '<label>Choice<input></label><button data-canvas-prompt="Review" onclick="window.dispatchEvent(new PageTransitionEvent(\'pagehide\'))">Close</button>',
      ),
      parseCanvasKey("reports/main"),
    ),
  );
  await page.evaluate(() => {
    const target = window as unknown as FixtureWindow;
    target.fixtureMessages = [];
    target.postMessage = (message: unknown): void => {
      target.fixtureMessages.push(message);
    };
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    document.dispatchEvent(new Event("input"));
  });
  await page.clock.runFor(450);
  expect(
    await page.evaluate(
      () => (window as unknown as FixtureWindow).fixtureMessages.length,
    ),
  ).toBe(1);
  // The authored click handler ends the lifetime in the same task that the
  // shim queues its trusted prompt, before that prompt's timer can run.
  await page.getByRole("button", { name: "Close" }).click();
  await page.evaluate(() => {
    document.dispatchEvent(new Event("input"));
    dispatchEvent(new PageTransitionEvent("pagehide"));
  });
  await page.clock.runFor(450);
  expect(await page.evaluate(() => "__canvasWriteback" in window)).toBe(false);
  expect(
    await page.evaluate(
      () => (window as unknown as FixtureWindow).fixtureMessages.length,
    ),
  ).toBe(1);
});
