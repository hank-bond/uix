import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import { toWorkspaceId } from "@uix/runtime/workspace";
import { resolveWorkspace } from "@uix/runtime/workspace-roots";

import { createServerWorkspaceRuntime } from "./workspace-runtime";

const temporaryDirectories: string[] = [];
const apiModuleDir = join(__dirname, "../../../../packages/api/src");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("server workspace runtime", () => {
  it("loads author API imports from a workspace outside the server installation", async () => {
    const root = await mkdtemp(join(tmpdir(), "server-external-workspace-"));
    temporaryDirectories.push(root);
    const manifestPath = join(root, "uix.workspace.json");
    await Promise.all([
      writeFile(
        manifestPath,
        JSON.stringify({
          name: "External workspace",
          features: [{ entry: "./feature.ts" }],
        }),
      ),
      writeFile(
        join(root, "feature.ts"),
        [
          'import { defineFeature } from "@uix/api/feature";',
          "export const feature = defineFeature({",
          '  id: "external",',
          "  workspace: () => ({}),",
          "});",
        ].join("\n"),
      ),
    ]);

    await using runtime = await createServerWorkspaceRuntime({
      registered: {
        id: toWorkspaceId("external"),
        name: "External workspace",
        workspace: resolveWorkspace(manifestPath),
      },
      piAppDataDir: join(root, "server-profile", "pi"),
      apiModuleDir,
      resourceTransport: () => ({
        [Symbol.dispose]() {},
      }),
    });

    using attachment = (await runtime.createAttachment({ kind: "fallback" }))
      .attachment;
    await using reload = attachment.prepareDispatch({
      channel: toChannelCanonicalId("uix", "reload"),
      payload: undefined,
    });
    await expect(reload.invoke()).resolves.toMatchObject({
      ok: true,
      value: {
        featuresActivated: 1,
        featuresFailed: 0,
        failures: [],
      },
    });
  });
});
