import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ResourceRequestContext } from "@uix/api/resources";

import { SurfaceModulePipeline } from "./surface-pipeline";
import type { ResolvedSurfaceContribution } from "./surfaces";

async function writeFeature(
  files: Record<string, string>,
  entry = "surface.tsx",
): Promise<ResolvedSurfaceContribution> {
  const root = await mkdtemp(join(tmpdir(), "surface-test-"));
  for (const [file, source] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), source);
  }
  return { featureId: "shiny", entry: join(root, entry), featureRoot: root };
}

const surfaceSource = `
import { useState } from "react";
import { helper } from "./helper";
import sheet from "./styles.css" with { type: "css" };
import { defineSettings } from "@uix/api/settings";
import { defineSurface } from "@uix/api/workspace";
import { Type } from "typebox";

const settings = defineSettings({
  schema: Type.Object({ demo: Type.String() }),
  default: { demo: "ok" },
});

function Panel() {
  const [n] = useState(1);
  return <p>{helper()}{settings.default.demo}{n}</p>;
}

export const surface = defineSurface({
  name: "shiny",
  styles: [sheet],
  render: () => <Panel />,
});
`;

const request = (
  params: Record<string, string | string[]>,
  version: string,
  origin?: string,
): ResourceRequestContext => ({
  request: new Request("uix-resource://uix.local/test", {
    ...(origin ? { headers: { origin } } : {}),
  }),
  params,
  query: { v: version },
});

function versionFrom(url: string): string {
  const version = new URL(
    url,
    "uix-resource://uix.local/surface/shiny/0.js",
  ).searchParams.get("v");
  if (!version) throw new Error(`Resource URL has no version: ${url}`);
  return version;
}

describe("SurfaceModulePipeline", () => {
  it("bundles local code, virtualizes shared modules, externalizes CSS", async () => {
    const reg = await writeFeature({
      "surface.tsx": surfaceSource,
      "helper.ts": `export const helper = () => "bundled in";`,
      "styles.css": `.shiny { color: red; }`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([reg]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.error).toBeUndefined();
    expect(entries[0]?.url).toMatch(
      /^uix-resource:\/\/uix\.local\/surface\/shiny\/0\.js\?v=[0-9a-f]{64}$/,
    );

    const [moduleRoute] = pipeline.createResourceContributions();
    const response = moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(entries[0]?.url)),
      ),
    );
    const code = await (await response).text();
    expect(code).toContain("bundled in");
    expect(code).toContain(`globalThis.__sharedModules["react"]`);
    expect(code).toContain(`globalThis.__sharedModules["@uix/api/workspace"]`);
    expect(code).toContain(`globalThis.__sharedModules["@uix/api/settings"]`);
    // CSS stays a native module script: external, hash-busted, attribute kept.
    expect(code).toMatch(
      /import .* from "\.\.\/\.\.\/surface-files\/shiny\/styles\.css\?v=[0-9a-f]{64}" with \{ type: "css" \}/,
    );
  });

  it("changes the module URL when the source changes", async () => {
    const reg = await writeFeature({
      "surface.tsx": `export const surface = { name: "shiny", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const first = await pipeline.buildAll([reg]);
    await writeFile(
      reg.entry,
      `export const surface = { name: "shiny", render: () => "changed" };`,
    );
    const second = await pipeline.buildAll([reg]);

    expect(first[0]?.url).toBeDefined();
    expect(second[0]?.url).toBeDefined();
    expect(second[0]?.url).not.toBe(first[0]?.url);

    const [moduleRoute] = pipeline.createResourceContributions();
    const firstResponse = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(first[0]?.url)),
      ),
    );
    const secondResponse = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(second[0]?.url)),
      ),
    );
    expect(await firstResponse.text()).not.toContain("changed");
    expect(await secondResponse.text()).toContain("changed");
  });

  it("isolates a broken surface as an error entry without failing the pass", async () => {
    const broken = await writeFeature({
      "surface.tsx": `export const surface = {{{`,
    });
    const fine = await writeFeature({
      "surface.tsx": `export const surface = { name: "shiny", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([broken, fine]);

    expect(entries[0]?.error).toBeDefined();
    expect(entries[0]?.url).toBeUndefined();
    expect(entries[1]?.url).toBeDefined();
  });

  it("rejects CSS imports without the module-script attribute", async () => {
    const reg = await writeFeature({
      "surface.tsx": `import "./styles.css";\nexport const surface = { name: "s", render: () => null };`,
      "styles.css": `.s {}`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([reg]);

    expect(entries[0]?.error).toContain('with { type: "css" }');
  });

  it("rejects CSS that escapes the feature directory", async () => {
    // Reference `sheet`: esbuild's TS loader elides imports whose
    // binding is never used, so an unused CSS import never reaches resolution.
    const reg = await writeFeature({
      "nested/surface.tsx": `import sheet from "../../outside.css" with { type: "css" };\nexport const surface = { name: "s", styles: [sheet], render: () => null };`,
    });
    await writeFile(join(reg.featureRoot, "..", "outside.css"), ".x {}");
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([
      { ...reg, entry: join(reg.featureRoot, "nested/surface.tsx") },
    ]);

    expect(entries[0]?.error).toContain(
      "must live inside the feature directory",
    );
  });

  it("serves feature files with content types and blocks path traversal", async () => {
    const reg = await writeFeature({
      "surface.tsx": `import sheet from "./styles.css" with { type: "css" };\nexport const surface = { name: "s", styles: [sheet], render: () => null };`,
      "styles.css": `@font-face { font-family: demo; src: url("./assets/demo.woff2") format("woff2"); }\n.s { color: blue; }`,
      "assets/demo.woff2": "font bytes",
    });
    const pipeline = new SurfaceModulePipeline("local");
    const entries = await pipeline.buildAll([reg]);
    const [moduleRoute, filesRoute] = pipeline.createResourceContributions();
    const moduleResponse = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(entries[0]?.url)),
      ),
    );
    const moduleCode = await moduleResponse.text();
    const cssUrl =
      /\.\.\/\.\.\/surface-files\/shiny\/styles\.css\?v=[0-9a-f]{64}/.exec(
        moduleCode,
      )?.[0];
    if (!cssUrl) throw new Error("Built module has no CSS URL");

    const css = await filesRoute.handler(
      request({ feature: "shiny", path: ["styles.css"] }, versionFrom(cssUrl)),
    );
    expect(css.status).toBe(200);
    expect(css.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(css.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const cssText = await css.text();
    expect(cssText).toContain("color: blue");
    expect(cssText).toMatch(/url\(\.\/assets\/demo\.woff2\?v=[0-9a-f]{64}\)/);

    const fontUrl = /\.\/assets\/demo\.woff2\?v=[0-9a-f]{64}/.exec(
      cssText,
    )?.[0];
    if (!fontUrl) throw new Error("Built CSS has no font URL");
    const font = await filesRoute.handler(
      request(
        {
          feature: "shiny",
          path: ["assets", "demo.woff2"],
        },
        versionFrom(fontUrl),
      ),
    );
    expect(font.status).toBe(200);
    expect(font.headers.get("Content-Type")).toBe("font/woff2");
    expect(font.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await font.text()).toBe("font bytes");

    const traversal = await filesRoute.handler(
      request({ feature: "shiny", path: ["..", "secret.txt"] }, "missing"),
    );
    expect(traversal.status).toBe(404);

    const missing = await filesRoute.handler(
      request({ feature: "shiny", path: ["nope.css"] }, "missing"),
    );
    expect(missing.status).toBe(404);
  });

  it("grants CORS to the page origin but never to uix-resource origins", async () => {
    // Module scripts are always fetched in CORS mode and the page is a
    // different origin (dev server / file:), so the grant is load-bearing;
    // feature-origin iframes stay refused.
    const reg = await writeFeature({
      "surface.tsx": `export const surface = { name: "s", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");
    const entries = await pipeline.buildAll([reg]);
    const [moduleRoute] = pipeline.createResourceContributions();
    const version = versionFrom(String(entries[0]?.url));

    const fromPage = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        version,
        "http://localhost:5173",
      ),
    );
    expect(fromPage.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );

    const fromIframe = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        version,
        "uix-resource://canvas.local",
      ),
    );
    expect(fromIframe.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("keeps a published immutable module available after rebuild", async () => {
    const reg = await writeFeature({
      "surface.tsx": `export const surface = { name: "s", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");
    const first = await pipeline.buildAll([reg]);
    await pipeline.buildAll([]);

    const [moduleRoute] = pipeline.createResourceContributions();
    const response = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(first[0]?.url)),
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("keeps references from overlapping composition requests usable", async () => {
    const reg = await writeFeature({
      "surface.tsx": `export const surface = { name: "s", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const olderBuild = pipeline.buildAll([reg]);
    const newerEntries = await pipeline.buildAll([]);
    const olderEntries = await olderBuild;

    expect(newerEntries).toEqual([]);
    const [moduleRoute] = pipeline.createResourceContributions();
    const response = await moduleRoute.handler(
      request(
        { feature: "shiny", file: "0.js" },
        versionFrom(String(olderEntries[0]?.url)),
      ),
    );
    expect(response.status).toBe(200);
  });
});
