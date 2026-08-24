import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseWorkspaceCatalog } from "@uix/host/catalog";

import { createServerHost } from "./server";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("server host launcher", () => {
  it("serves a path-free catalog from the deployment public origin", async () => {
    const fixture = await createFixture();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "https://public.example:9443",
      assetRoot: fixture.assetRoot,
    });
    const privateAddress = await host.listen({ host: "127.0.0.1", port: 0 });

    const response = await fetch(`${privateAddress}/api/catalog`);
    const catalog = parseWorkspaceCatalog(await response.json());

    expect(host.registry.require("reference").workspace).toMatchObject({
      stateRoot: fixture.root,
      manifestPath: join(fixture.root, "uix.workspace.json"),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(catalog).toEqual({
      version: 1,
      workspaces: [
        {
          id: "reference",
          name: "Reference workspace",
          location: "https://public.example:9443/w/reference",
        },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain(fixture.root);
  });

  it("serves the shared launcher shell and its built assets", async () => {
    const fixture = await createFixture();
    await using host = await createServerHost({
      registryPath: fixture.registryPath,
      publicOrigin: "http://127.0.0.1:3000",
      assetRoot: fixture.assetRoot,
    });
    const address = await host.listen({ host: "127.0.0.1", port: 0 });

    const [page, script, styles] = await Promise.all([
      fetch(`${address}/`),
      fetch(`${address}/assets/launcher.js`),
      fetch(`${address}/assets/launcher.css`),
    ]);

    expect(await page.text()).toContain('<div id="root"></div>');
    const contentSecurityPolicy = page.headers.get("content-security-policy");
    for (const directive of [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(contentSecurityPolicy).toContain(directive);
    }
    for (const response of [page, script, styles]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    expect(await script.text()).toBe("launcher-script");
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await styles.text()).toBe("launcher-styles");
    expect(styles.headers.get("content-type")).toContain("text/css");
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly registryPath: string;
  readonly assetRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "server-host-test-"));
  temporaryDirectories.push(root);
  const assetRoot = join(root, "public");
  await mkdir(join(assetRoot, "assets"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "uix.workspace.json"),
      JSON.stringify({ name: "Reference workspace", features: [] }),
    ),
    writeFile(
      join(root, "server.workspaces.json"),
      JSON.stringify({
        version: 1,
        workspaces: [{ id: "reference", manifest: "./uix.workspace.json" }],
      }),
    ),
    writeFile(
      join(assetRoot, "index.html"),
      '<!doctype html><div id="root"></div>',
    ),
    writeFile(join(assetRoot, "assets/launcher.js"), "launcher-script"),
    writeFile(join(assetRoot, "assets/launcher.css"), "launcher-styles"),
  ]);
  return {
    root,
    registryPath: join(root, "server.workspaces.json"),
    assetRoot,
  };
}
