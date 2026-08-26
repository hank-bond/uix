// Starts one configured server host and cleans up failed listener admission.

import { resolveServerConfiguration } from "./configuration";
import type { CreateServerHostOptions, ServerHost } from "./server";
import { createServerWorkspaceRuntime } from "./workspace-runtime";

interface StartServerOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly assetRoot: string;
  readonly hostAddress?: string;
  readonly createHost: (
    options: CreateServerHostOptions,
  ) => Promise<ServerHost>;
}

export interface StartedServer {
  readonly ok: true;
  readonly host: ServerHost;
  readonly address: string;
  readonly publicOrigin: string;
  readonly registryPath: string;
  readonly piAppDataDir: string;
}

export interface FailedServerStart {
  readonly ok: false;
  readonly error: Error;
  readonly cleanupError?: Error;
}

export type ServerStartResult = StartedServer | FailedServerStart;

/** Validate process configuration, open the listener, and clean up partial startup on failure. */
export async function startServer(
  options: StartServerOptions,
): Promise<ServerStartResult> {
  let host: ServerHost | undefined;
  try {
    const hostAddress = options.hostAddress ?? "127.0.0.1";
    const configuration = resolveServerConfiguration({
      environment: options.environment,
      cwd: options.cwd,
      hostAddress,
    });
    host = await options.createHost({
      registryPath: configuration.registryPath,
      publicOrigin: configuration.publicOrigin,
      assetRoot: options.assetRoot,
      bootWorkspace: (registered) =>
        createServerWorkspaceRuntime({
          registered,
          piAppDataDir: configuration.piAppDataDir,
        }),
    });
    const address = await host.listen({
      host: hostAddress,
      port: configuration.port,
    });
    return {
      ok: true,
      host,
      address,
      publicOrigin: configuration.publicOrigin,
      registryPath: configuration.registryPath,
      piAppDataDir: configuration.piAppDataDir,
    };
  } catch (error) {
    let cleanupError: Error | undefined;
    if (host) {
      try {
        await host[Symbol.asyncDispose]();
      } catch (cleanupFailure) {
        cleanupError = toError(cleanupFailure);
      }
    }
    return { ok: false, error: toError(error), cleanupError };
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
