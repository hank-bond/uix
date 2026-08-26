import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { buildServer } from "./build.config.mjs";

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

  it("builds browser JSX without ambient React runtime access", async () => {
    await buildServer();

    const launcherScript = await readFile(
      resolve(
        import.meta.dirname,
        "../../out/server/public/assets/launcher.js",
      ),
      "utf8",
    );

    const launcherModuleStart = launcherScript.indexOf(
      "// packages/client/src/launcher/Launcher.tsx",
    );
    const launcherModuleEnd = launcherScript.indexOf(
      "// hosts/server/src/browser/launcher-adapter.ts",
      launcherModuleStart,
    );
    expect(launcherModuleStart).toBeGreaterThanOrEqual(0);
    expect(launcherModuleEnd).toBeGreaterThan(launcherModuleStart);
    const launcherModule = launcherScript.slice(
      launcherModuleStart,
      launcherModuleEnd,
    );
    expect(launcherModule).toContain("import_jsx_runtime");
    expect(launcherModule).not.toContain("React.createElement");
  });
});
