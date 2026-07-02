// Pipeline tests over real temp-dir surface sources: bundling, shared-module
// virtualization, CSS module script externalization with hash busting,
// error isolation, and the module/files route handlers.

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ResourceRequestContext } from "@uix/api/resources";

import { SurfaceModulePipeline } from "./surface-pipeline";
import type { SurfaceRegistration } from "./surfaces";

async function writeFeature(
  files: Record<string, string>,
  entry = "surface.tsx",
): Promise<SurfaceRegistration> {
  const root = await mkdtemp(join(tmpdir(), "uix-surface-test-"));
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
import { defineSurface } from "@uix/api/workspace";

function Panel() {
  const [n] = useState(1);
  return <p>{helper()}{n}</p>;
}

export default defineSurface({
  name: "shiny",
  styles: [sheet],
  render: () => <Panel />,
});
`;

const request = (
  params: Record<string, string | string[]>,
): ResourceRequestContext => ({
  request: new Request("uix-resource://uix.local/test"),
  params,
  query: {},
});

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
      /^uix-resource:\/\/uix\.local\/surface\/shiny\/0\.js\?v=[0-9a-f]{12}$/,
    );

    const [moduleRoute] = pipeline.resourceContributions();
    const response = moduleRoute?.handle(
      request({ feature: "shiny", file: "0.js" }),
    );
    const code = await (await response)?.text();
    expect(code).toContain("bundled in");
    expect(code).toContain(`globalThis.__uixSharedModules["react"]`);
    expect(code).toContain(
      `globalThis.__uixSharedModules["@uix/api/workspace"]`,
    );
    // CSS stays a native module script: external, hash-busted, attribute kept.
    expect(code).toMatch(
      /import .* from "uix-resource:\/\/uix\.local\/surface-files\/shiny\/styles\.css\?v=[0-9a-f]{12}" with \{ type: "css" \}/,
    );
  });

  it("changes the module URL when the source changes", async () => {
    const reg = await writeFeature({
      "surface.tsx": `export default { name: "shiny", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const first = await pipeline.buildAll([reg]);
    await writeFile(
      reg.entry,
      `export default { name: "shiny", render: () => "changed" };`,
    );
    const second = await pipeline.buildAll([reg]);

    expect(first[0]?.url).toBeDefined();
    expect(second[0]?.url).toBeDefined();
    expect(second[0]?.url).not.toBe(first[0]?.url);
  });

  it("isolates a broken surface as an error entry without failing the pass", async () => {
    const broken = await writeFeature({
      "surface.tsx": `export default {{{`,
    });
    const fine = await writeFeature({
      "surface.tsx": `export default { name: "shiny", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([broken, fine]);

    expect(entries[0]?.error).toBeDefined();
    expect(entries[0]?.url).toBeUndefined();
    expect(entries[1]?.url).toBeDefined();
  });

  it("rejects CSS imports without the module-script attribute", async () => {
    const reg = await writeFeature({
      "surface.tsx": `import "./styles.css";\nexport default { name: "s", render: () => null };`,
      "styles.css": `.s {}`,
    });
    const pipeline = new SurfaceModulePipeline("local");

    const entries = await pipeline.buildAll([reg]);

    expect(entries[0]?.error).toContain('with { type: "css" }');
  });

  it("rejects CSS that escapes the feature directory", async () => {
    // `sheet` must be referenced: esbuild's TS loader elides imports whose
    // binding is never used, so an unused CSS import never reaches resolution.
    const reg = await writeFeature({
      "nested/surface.tsx": `import sheet from "../../outside.css" with { type: "css" };\nexport default { name: "s", styles: [sheet], render: () => null };`,
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
      "surface.tsx": `export default { name: "s", render: () => null };`,
      "styles.css": `.s { color: blue; }`,
    });
    const pipeline = new SurfaceModulePipeline("local");
    await pipeline.buildAll([reg]);
    const [, filesRoute] = pipeline.resourceContributions();

    const css = await filesRoute?.handle(
      request({ feature: "shiny", path: ["styles.css"] }),
    );
    expect(css?.status).toBe(200);
    expect(css?.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(await css?.text()).toContain("color: blue");

    const traversal = await filesRoute?.handle(
      request({ feature: "shiny", path: ["..", "secret.txt"] }),
    );
    expect(traversal?.status).toBe(404);

    const missing = await filesRoute?.handle(
      request({ feature: "shiny", path: ["nope.css"] }),
    );
    expect(missing?.status).toBe(404);
  });

  it("drops previously built modules on rebuild", async () => {
    const reg = await writeFeature({
      "surface.tsx": `export default { name: "s", render: () => null };`,
    });
    const pipeline = new SurfaceModulePipeline("local");
    await pipeline.buildAll([reg]);
    await pipeline.buildAll([]);

    const [moduleRoute] = pipeline.resourceContributions();
    const response = await moduleRoute?.handle(
      request({ feature: "shiny", file: "0.js" }),
    );
    expect(response?.status).toBe(404);
  });
});
