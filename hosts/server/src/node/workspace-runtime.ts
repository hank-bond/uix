// Boots one registered workspace runtime over server-owned dependency adapters.

import { createWorkspaceRuntime, type WorkspaceRuntime } from "@uix/runtime";

import type { RegisteredWorkspace } from "./registry";

interface CreateServerWorkspaceRuntimeOptions {
  readonly registered: RegisteredWorkspace;
  readonly piAppDataDir: string;
  readonly apiModuleDir?: string;
}

/** Construct and initially activate exactly one lazily admitted server workspace. */
export async function createServerWorkspaceRuntime(
  options: CreateServerWorkspaceRuntimeOptions,
): Promise<WorkspaceRuntime> {
  const runtime = createWorkspaceRuntime({
    workspaceId: options.registered.id,
    workspace: options.registered.workspace,
    piAppDataDir: options.piAppDataDir,
    ...(options.apiModuleDir && { apiModuleDir: options.apiModuleDir }),
    dependencies: {
      openExternal: () => {
        throw new Error(
          "The server host does not open provider links on its machine",
        );
      },
    },
  });
  try {
    await runtime.load();
    return runtime;
  } catch (error) {
    try {
      await runtime[Symbol.asyncDispose]();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Workspace ${options.registered.id} failed to boot and clean up`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
