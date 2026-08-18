// Proves the ownership-root import graph enforced by eslint.config.mjs actually
// fires. The rules target roots that may still be empty, so no production file
// can exercise them yet; this suite pins each boundary against synthetic
// fixtures so the enforcement cannot silently rot before the roots gain source.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import {
  clientAdapterBoundaryRule,
  ownershipBoundaryRules,
} from "../eslint.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const eslint = new ESLint({
  cwd: root,
  // Ignore the repo config file; run only the boundary rules under test.
  overrideConfigFile: true,
  overrideConfig: [...ownershipBoundaryRules, clientAdapterBoundaryRule],
});

async function lintImport(filePath, specifier) {
  const [result] = await eslint.lintText(`import "${specifier}";`, {
    filePath,
  });
  return result.messages;
}

// file -> forbidden specifiers. Each pair must report a no-restricted-imports
// violation.
const forbidden = [
  ["packages/runtime/src/index.ts", "@uix/client"],
  ["packages/runtime/src/index.ts", "@uix/host"],
  ["packages/runtime/src/index.ts", "@uix/host-electron"],
  ["packages/runtime/src/index.ts", "../../hosts/electron/index.ts"],
  ["packages/client/src/index.ts", "@uix/runtime"],
  ["packages/client/src/index.ts", "@uix/host"],
  ["packages/client/src/index.ts", "#shared/ipc"],
  ["packages/client/src/index.ts", "../../hosts/server/index.ts"],
  ["packages/client/src/index.ts", "../../../src/renderer/main.ts"],
  ["packages/client/src/index.ts", "../../../src/features/chat/index.ts"],
  ["packages/host/src/index.ts", "@uix/client"],
  ["packages/host/src/index.ts", "@uix/host-electron"],
  ["packages/host/src/index.ts", "../../apps/features/chat/index.ts"],
  ["apps/features/chat/src/index.ts", "@uix/runtime"],
  ["apps/features/chat/src/index.ts", "@uix/client"],
  ["apps/features/chat/src/index.ts", "@uix/host"],
  ["apps/features/chat/src/index.ts", "@uix/host-server"],
  ["apps/features/chat/src/index.ts", "../../../hosts/server/index.ts"],
  ["apps/workspaces/default/features/tools/src/index.ts", "@uix/runtime"],
  ["hosts/electron/src/index.ts", "@uix/host-server"],
  ["hosts/electron/src/index.ts", "@uix/host-server/session.ts"],
  ["hosts/server/src/index.ts", "@uix/host-electron"],
  ["hosts/server/src/index.ts", "../../apps/features/chat/index.ts"],
];

// file -> allowed specifiers. Each pair must lint clean.
const allowed = [
  ["packages/runtime/src/index.ts", "@uix/api"],
  ["packages/runtime/src/index.ts", "node:fs"],
  ["packages/client/src/index.ts", "@uix/api"],
  ["packages/client/src/index.ts", "react"],
  ["packages/host/src/index.ts", "@uix/api"],
  ["packages/host/src/index.ts", "@uix/runtime"],
  ["apps/features/chat/src/index.ts", "@uix/api"],
  ["apps/features/chat/src/index.ts", "react"],
  ["hosts/electron/src/index.ts", "@uix/api"],
  ["hosts/electron/src/index.ts", "@uix/host"],
  ["hosts/electron/src/index.ts", "@uix/runtime"],
  ["hosts/electron/src/index.ts", "@uix/client"],
  ["hosts/server/src/index.ts", "@uix/host"],
  ["hosts/server/src/index.ts", "@uix/runtime"],
];

describe("ownership-root import graph", () => {
  it("blocks ambient host channels from shared clients", async () => {
    const [result] = await eslint.lintText("window.channels.request();", {
      filePath: "packages/client/src/index.ts",
    });
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-properties",
      ),
    ).toBe(true);
  });

  for (const [file, specifier] of forbidden) {
    it(`blocks ${specifier} from ${file}`, async () => {
      const messages = await lintImport(file, specifier);
      expect(
        messages.some((message) => message.ruleId === "no-restricted-imports"),
      ).toBe(true);
    });
  }

  for (const [file, specifier] of allowed) {
    it(`allows ${specifier} from ${file}`, async () => {
      const messages = await lintImport(file, specifier);
      expect(messages).toEqual([]);
    });
  }
});
