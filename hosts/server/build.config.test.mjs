import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import { browserJsxOptions, buildServer } from "./build.config.mjs";

describe("server browser build", () => {
  it("copies the browser-owned launcher document into the server output", async () => {
    await buildServer();

    const [source, output] = await Promise.all([
      readFile(
        resolve(import.meta.dirname, "src/browser/launcher.html"),
        "utf8",
      ),
      readFile(
        resolve(import.meta.dirname, "../../out/server/public/index.html"),
        "utf8",
      ),
    ]);
    expect(output).toBe(source);
  });

  it("executes JSX modules that do not import an ambient React value", async () => {
    const result = await build({
      stdin: {
        contents: "export const View = () => <main>Launcher</main>;",
        loader: "tsx",
        resolveDir: import.meta.dirname,
      },
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node22",
      write: false,
      ...browserJsxOptions,
    });
    const output = result.outputFiles[0];
    expect(output).toBeDefined();

    const module = { exports: {} };
    Function("module", "exports", output.text)(module, module.exports);
    const { View } = module.exports;

    expect(View()).toMatchObject({
      type: "main",
      props: { children: "Launcher" },
    });
  });
});
