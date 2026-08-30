// Starts the selected server deployment profile from environment-backed host configuration.

import process from "node:process";
import { fileURLToPath } from "node:url";

import { AsyncDisposableBag } from "@uix/runtime/lifecycle";
import { createLogger } from "@uix/runtime/log";

import { parseServerArguments, renderServerHelp } from "./configuration";
import { createServerHost } from "./server";
import { startServer } from "./start";

const log = createLogger("server");
const processBag = new AsyncDisposableBag();

async function start(): Promise<void> {
  let command: "help" | "start";
  try {
    command = parseServerArguments(process.argv.slice(2));
  } catch (error) {
    log.error({ err: toError(error) }, "server_arguments_invalid");
    process.exitCode = 1;
    return;
  }
  if (command === "help") {
    process.stdout.write(renderServerHelp());
    return;
  }

  const result = await startServer({
    environment: process.env,
    cwd: process.cwd(),
    assetRoot: fileURLToPath(new URL("./public/", import.meta.url)),
    apiModuleDir: fileURLToPath(new URL("./api/", import.meta.url)),
    createHost: createServerHost,
  });
  if (!result.ok) {
    if (result.cleanupError) {
      log.error({ err: result.cleanupError }, "server_cleanup_failed");
    }
    log.error({ err: result.error }, "server_start_failed");
    process.exitCode = 1;
    return;
  }

  log.info(
    {
      profile: result.profile,
      address: result.address,
      publicOrigin: result.publicOrigin,
      registryPath: result.registryPath,
    },
    "server_started",
  );
  processBag.add(result.host);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

void start();
