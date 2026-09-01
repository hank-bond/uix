// Electron host adapter for the substrate resource protocol.
//
// Electron registers the privileged scheme once for the host. Runtime resource
// registries contribute workspace-qualified handlers to this transport instead
// of registering and unregistering Electron's process-wide protocol directly.

import { protocol } from "electron";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import { disposable } from "@uix/runtime/lifecycle";
import type { ResourceTransportRegistrar } from "@uix/runtime/resource-registry";
import type { WorkspaceId } from "@uix/runtime/workspace";

type ResourceHandler = Parameters<ResourceTransportRegistrar>[1];
type WorkspaceGuardAcquirer = (origin: string) => Promise<Disposable>;

interface WorkspaceResourceRoute {
  readonly acquireWorkspaceGuard: WorkspaceGuardAcquirer;
}

/**
 * Register the privileged substrate resource scheme before Electron is ready.
 *
 * Scheme-level CORS support permits CORS-mode requests to reach handlers. Each
 * response remains responsible for granting an origin.
 */
export function registerResourceProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ResourceProtocolScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // Without this Chromium refuses CORS-mode requests *to* the scheme
        // at the network layer. Module scripts (the surface pipeline)
        // are always fetched in CORS mode. Actual grants stay per-response:
        // the surface routes echo non-uix-resource origins only.
        corsEnabled: true,
      },
    },
  ]);
}

/** Process-wide table of workspace-qualified runtime resource handlers. */
export class ElectronResourceTransport {
  readonly #workspaceRoutes = new Map<WorkspaceId, WorkspaceResourceRoute>();
  readonly #handlers = new Map<WorkspaceId, ResourceHandler>();

  /** Register one workspace's guarded resource route for its host lifetime. */
  registerWorkspace(
    workspaceId: WorkspaceId,
    acquireWorkspaceGuard: WorkspaceGuardAcquirer,
  ): Disposable {
    if (this.#workspaceRoutes.has(workspaceId)) {
      throw new Error(
        `Electron workspace resources already registered: ${workspaceId as string}`,
      );
    }
    const route = { acquireWorkspaceGuard };
    this.#workspaceRoutes.set(workspaceId, route);
    return disposable(() => {
      if (this.#workspaceRoutes.get(workspaceId) === route) {
        this.#workspaceRoutes.delete(workspaceId);
      }
    });
  }

  /** Construct the registrar injected into one workspace runtime generation. */
  createRegistrar(workspaceId: WorkspaceId): ResourceTransportRegistrar {
    return (_scheme, handler) => {
      if (this.#handlers.has(workspaceId)) {
        throw new Error(
          `Electron resource handler already registered: ${workspaceId as string}`,
        );
      }
      this.#handlers.set(workspaceId, handler);
      return disposable(() => {
        if (this.#handlers.get(workspaceId) === handler) {
          this.#handlers.delete(workspaceId);
        }
      });
    };
  }

  /** Select a runtime by the workspace token in the logical resource host. */
  async handle(request: Request): Promise<Response> {
    let hostname: string;
    try {
      const url = new URL(request.url);
      if (url.protocol !== `${ResourceProtocolScheme}:`) {
        return textResponse("Resource scheme not found", 404);
      }
      hostname = url.hostname;
    } catch {
      // URL parse failures are untrusted request input, so a 400 is sufficient.
      return textResponse("Invalid resource URL", 400);
    }

    for (const [workspaceId, route] of this.#workspaceRoutes) {
      if (
        hostname !== (workspaceId as string) &&
        !hostname.endsWith(`.${workspaceId as string}`)
      ) {
        continue;
      }
      let workspaceGuard: Disposable;
      try {
        workspaceGuard = await route.acquireWorkspaceGuard("electron-resource");
      } catch {
        // Workspace teardown closes admission before removing the registration.
        return textResponse("Workspace resources are unavailable", 503);
      }
      using _workspaceGuard = workspaceGuard;
      const handler = this.#handlers.get(workspaceId);
      if (!handler) {
        return textResponse("Workspace resources are unavailable", 503);
      }
      return await handler(request);
    }
    return textResponse("Workspace resources are unavailable", 503);
  }
}

/** Bind Electron's process-wide protocol once to the qualified transport. */
export function bindResourceProtocol(
  transport: ElectronResourceTransport,
): Disposable {
  protocol.handle(ResourceProtocolScheme, (request) =>
    transport.handle(request),
  );
  return disposable(() => {
    protocol.unhandle(ResourceProtocolScheme);
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
