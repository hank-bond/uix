// Adapts Electron's privileged protocol to guarded workspace resources and viewpoint routes.
//
// Electron registers the privileged scheme once for the host. Workspace
// runtimes contribute content handlers to this transport instead
// of registering and unregistering Electron's process-wide protocol directly.

import { protocol } from "electron";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import type { ContentTransportRegistrar } from "@uix/runtime/content-transport";
import { disposable } from "@uix/runtime/lifecycle";
import type { WorkspaceId } from "@uix/runtime/workspace";

import { decodeViewpointUrl } from "../viewpoint-urls";

type ContentHandler = Parameters<ContentTransportRegistrar>[0];
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
  readonly #handlers = new Map<WorkspaceId, ContentHandler>();

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
  createRegistrar(workspaceId: WorkspaceId): ContentTransportRegistrar {
    return (handler) => {
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

  /** Hold a workspace guard until the content handler settles. */
  async handle(request: Request): Promise<Response> {
    let url: URL;
    try {
      url = new URL(request.url);
      if (url.protocol !== `${ResourceProtocolScheme}:`) {
        return textResponse("Resource scheme not found", 404);
      }
    } catch {
      // URL parse failures are untrusted request input, so a 400 is sufficient.
      return textResponse("Invalid resource URL", 400);
    }

    for (const [workspaceId, route] of this.#workspaceRoutes) {
      if (
        url.hostname !== (workspaceId as string) &&
        !url.hostname.endsWith(`.${workspaceId as string}`)
      ) {
        continue;
      }
      const isViewpoint = url.hostname.endsWith(
        `.viewpoint.${workspaceId as string}`,
      );
      const viewpoint = isViewpoint
        ? decodeViewpointUrl(url, workspaceId)
        : undefined;
      if (isViewpoint && !viewpoint)
        return textResponse("Viewpoint location not found", 404);
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
      return await handler(
        viewpoint
          ? {
              kind: "viewpoint",
              request: { ...viewpoint, method: request.method },
            }
          : { kind: "resource", request },
      );
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
