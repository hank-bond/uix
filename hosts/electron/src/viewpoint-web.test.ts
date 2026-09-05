import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { _electron, type ElectronApplication, type Page } from "playwright";
import { expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const execFileAsync = promisify(execFile);

it("loads attachment-selected Canvas documents through real Electron and rotates mounted URL clients", async () => {
  await using lifetime = new AsyncDisposableStack();
  const root = await mkdtemp(join(tmpdir(), "uix-electron-viewpoint-"));
  lifetime.defer(() => rm(root, { recursive: true, force: true }));
  let page: Page | undefined;
  const errors: string[] = [];
  try {
    await createFixture(root);
    await execFileAsync(
      process.execPath,
      [
        join(repositoryRoot, "node_modules/electron-vite/bin/electron-vite.js"),
        "build",
        "--config",
        "hosts/electron/electron.vite.config.ts",
      ],
      { cwd: repositoryRoot },
    );
    const env: { [key: string]: string } = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      UIX_WORKSPACE: root,
    };
    delete env["ELECTRON_RUN_AS_NODE"];
    delete env["ELECTRON_RENDERER_URL"];
    const isWindowVisible =
      process.env["UIX_ELECTRON_TEST_SHOW_WINDOW"] === "1";
    const electron = await _electron.launch({
      args: [
        repositoryRoot,
        `--user-data-dir=${join(root, "user-data")}`,
        ...(isWindowVisible ? [] : ["--hidden"]),
      ],
      cwd: repositoryRoot,
      env,
    });
    lifetime.defer(() => electron.close());
    const workspacePage = await electron.firstWindow();
    expect(
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isVisible(),
      ),
    ).toBe(isWindowVisible);
    page = workspacePage;
    const errorListener = (error: Error): void => {
      errors.push(error.message);
    };
    workspacePage.on("pageerror", errorListener);
    lifetime.defer(() => {
      workspacePage.off("pageerror", errorListener);
    });
    const route = page.locator("[data-route]");
    await route.waitFor();
    await page
      .getByText("Underscored feature mounted", { exact: true })
      .waitFor();
    const initialUrl = await route.textContent();
    if (!initialUrl) throw new Error("Missing initial bound URL");
    expect(initialUrl).toMatch(
      /^uix-resource:\/\/canvas\.viewpoint\.local\/[^/]+\/view\?key=reports%2Fmain$/,
    );
    await page.getByLabel("Retained surface state").fill("keep me");

    await writeCanvas(page, "First Agent");
    await page.getByRole("button", { name: "Reload route probe" }).click();
    const frame = page.frameLocator('iframe[title="Route probe"]');
    await expect
      .poll(() => frame.locator("h1").textContent())
      .toBe("First Agent");
    expect(
      await frame
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).color),
    ).toBe("rgb(12, 34, 56)");
    expect(
      await frame
        .locator("h1")
        .evaluate((node) => node.getBoundingClientRect().width),
    ).toBeGreaterThan(100);
    expect(
      await frame
        .locator("body")
        .evaluate(
          () => "channels" in window || "attachmentWebBinding" in window,
        ),
    ).toBe(false);
    expect(await frame.locator("base").count()).toBe(0);
    const featureRoot = new URL(".", initialUrl).href;
    expect(await frame.locator("#asset").getAttribute("href")).toBe(
      "assets/site.css",
    );
    expect(
      await frame
        .locator("#asset")
        .evaluate((node) => (node as HTMLAnchorElement).href),
    ).toBe(`${featureRoot}assets/site.css`);
    await frame.getByRole("link", { name: "Details", exact: true }).click();
    await expect
      .poll(() => frame.locator("body").evaluate(() => location.href))
      .toBe(`${initialUrl}#details`);
    await frame
      .getByRole("link", { name: "Dynamic details", exact: true })
      .click();
    expect(await frame.locator("body").evaluate(() => location.href)).toBe(
      `${initialUrl}#details`,
    );
    expect(
      await frame
        .locator("body")
        .evaluate(() => new URL("?key=other", location.href).href),
    ).toBe(`${featureRoot}view?key=other`);

    // The unchanged production Canvas resource surface mounts beside the route probe.
    await page.locator('iframe[title="canvas main"]').waitFor();
    await page.locator("textarea").waitFor();
    const original = await page.evaluate(() =>
      window.attachmentWebBinding.read(),
    );
    await page.evaluate(() =>
      window.channels.request("agent.new_session", {
        mutationId: "electron-viewpoint-next",
      }),
    );
    await expect.poll(() => route.textContent()).not.toBe(initialUrl);
    const nextUrl = await route.textContent();
    if (!nextUrl) throw new Error("Missing replacement bound URL");
    const replacement = await page.evaluate(() =>
      window.attachmentWebBinding.read(),
    );
    expect(replacement.revision).toBe(original.revision + 1);
    expect(replacement.binding).not.toBe(original.binding);
    expect(await page.getByLabel("Retained surface state").inputValue()).toBe(
      "keep me",
    );
    expect(await fetchStatus(electron, initialUrl)).toBe(404);
    await writeCanvas(page, "Second Agent");
    await page.getByRole("button", { name: "Reload route probe" }).click();
    await expect
      .poll(() => frame.locator("h1").textContent())
      .toBe("Second Agent");
    expect(await fetchStatus(electron, nextUrl)).toBe(200);
    expect(
      await fetchStatus(electron, nextUrl.replace("/view?", "/view/?")),
    ).toBe(404);
    expect(
      await fetchStatus(electron, nextUrl.replace("/view?", "/nested/view?")),
    ).toBe(404);
    expect(
      await fetchStatus(electron, new URL("view", new URL(".", nextUrl)).href),
    ).toBe(400);
    await mkdir(join(repositoryRoot, "out/test-results"), { recursive: true });
    await page.screenshot({
      path: join(repositoryRoot, "out/test-results/electron-viewpoint.png"),
    });
    expect(errors).toEqual([]);

    // Keep the process alive on hosts that quit when their last window closes.
    // This observer has no attachment and cannot keep the old binding alive.
    await electron.evaluate(({ BrowserWindow }) => {
      new BrowserWindow({ show: false });
    });
    await page.close();
    expect(await fetchStatus(electron, nextUrl)).toBe(404);
  } catch (error) {
    if (page && !page.isClosed()) {
      try {
        await mkdir(join(repositoryRoot, "out/test-results"), {
          recursive: true,
        });
        await page.screenshot({
          path: join(
            repositoryRoot,
            "out/test-results/electron-viewpoint-failure.png",
          ),
        });
      } catch {
        // Diagnostic capture must not replace the original test failure.
      }
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nRenderer errors: ${errors.join("\n")}`,
      { cause: error },
    );
  }
}, 120_000);

async function fetchStatus(
  electron: ElectronApplication,
  url: string,
): Promise<number> {
  return electron.evaluate(
    async ({ net }, address) => (await net.fetch(address)).status,
    url,
  );
}

async function writeCanvas(page: Page, label: string): Promise<void> {
  await page.evaluate(
    ({ label }) =>
      window.channels.request("canvas.writeback", {
        key: "reports/main",
        html: `<html><head><style>h1 { color: rgb(12, 34, 56); } #details { margin-top: 900px; }</style></head><body><h1>${label}</h1><a href="#details">Details</a><a id="asset" href="assets/site.css">Asset</a><div id="details">Target</div><script>const a = document.createElement('a'); a.href = '#details'; a.textContent = 'Dynamic details'; document.body.append(a);</script></body></html>`,
      }),
    { label },
  );
}

async function createFixture(root: string): Promise<void> {
  const canvasRoot = join(repositoryRoot, "src/features/canvas");
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(root, "node_modules"),
  );
  await writeFile(
    join(root, "uix.workspace.json"),
    JSON.stringify({
      name: "Electron viewpoint fixture",
      features: [
        { entry: "./canvas.ts", settings: {} },
        { entry: "./underscored.ts", settings: {} },
        {
          entry: join(repositoryRoot, "src/features/chat/index.ts"),
          settings: {},
        },
      ],
      settings: {},
    }),
  );
  await writeFile(
    join(root, "underscored.ts"),
    `
import { defineFeature } from "@uix/api/feature";
export const feature = defineFeature({ id: "my_feature", workspace: () => ({ surfaces: ["./underscored-surface.tsx"] }) });
`,
  );
  await writeFile(
    join(root, "underscored-surface.tsx"),
    `
import { defineSurface } from "@uix/api/workspace";
export const surface = defineSurface({ name: "underscore-probe", render: () => <p>Underscored feature mounted</p> });
`,
  );
  await writeFile(
    join(root, "canvas.ts"),
    `
import { feature as canvas } from ${JSON.stringify(join(canvasRoot, "index.ts"))};
export const feature = {
  ...canvas,
  workspace(ctx) {
    const contributions = canvas.workspace(ctx);
    return { ...contributions, surfaces: [${JSON.stringify(join(canvasRoot, "workspace/surface.tsx"))}, "./probe.tsx"] };
  },
};
`,
  );
  await writeFile(
    join(root, "probe.tsx"),
    `
import { useState } from "react";
import { defineSurface, useWebRouteClient } from "@uix/api/workspace";
import { CanvasDocumentRoute } from ${JSON.stringify(join(canvasRoot, "shared/web-routes.ts"))};
function Probe() {
  const client = useWebRouteClient(CanvasDocumentRoute);
  const url = client.toUrl({ query: { key: "reports/main" } });
  const [revision, setRevision] = useState(0);
  return <section style={{ width: "100%", minWidth: 240 }}>
    <input aria-label="Retained surface state" />
    <output data-route style={{ display: "block", overflowWrap: "anywhere" }}>{url}</output>
    <button onClick={() => setRevision(revision + 1)}>Reload route probe</button>
    <iframe title="Route probe" key={url + revision} src={url} style={{ width: "100%", height: 400 }} />
  </section>;
}
export const surface = defineSurface({ name: "route-probe", render: () => <Probe /> });
`,
  );
}
