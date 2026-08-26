import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import { browserJsxOptions, buildServer } from "./build.config.mjs";

const execFileAsync = promisify(execFile);

describe("server browser build", () => {
  it("copies the browser-owned documents into the server output", async () => {
    await buildServer();

    const [launcherSource, launcherOutput, workspaceSource, workspaceOutput] =
      await Promise.all([
        readFile(
          resolve(import.meta.dirname, "src/browser/launcher.html"),
          "utf8",
        ),
        readFile(
          resolve(import.meta.dirname, "../../out/server/public/index.html"),
          "utf8",
        ),
        readFile(
          resolve(import.meta.dirname, "src/browser/workspace.html"),
          "utf8",
        ),
        readFile(
          resolve(
            import.meta.dirname,
            "../../out/server/public/workspace.html",
          ),
          "utf8",
        ),
      ]);
    expect(launcherOutput).toBe(launcherSource);
    expect(workspaceOutput).toBe(workspaceSource);
  });

  it("starts the ESM process output without bundled CommonJS require failures", async () => {
    await buildServer();

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [resolve(import.meta.dirname, "../../out/server/index.mjs"), "--help"],
      { cwd: resolve(import.meta.dirname, "../..") },
    );

    expect(stdout).toContain("Usage: npm run start:server");
    expect(stderr).toBe("");
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
