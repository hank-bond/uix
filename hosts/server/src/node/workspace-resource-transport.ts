// Binds each supervised runtime's logical resource dispatcher to server HTTP requests.

import type { ContentTransportRegistrar } from "@uix/runtime/content-transport";
import { disposable } from "@uix/runtime/lifecycle";
import type { WorkspaceId } from "@uix/runtime/workspace";

type ContentHandler = Parameters<ContentTransportRegistrar>[0];

/** Own the live runtime resource handlers selected by workspace HTTP routes. */
export class WorkspaceResourceTransport {
  readonly #handlers = new Map<WorkspaceId, ContentHandler>();

  /** Register one runtime handler and return its exact registration lifetime. */
  register(workspaceId: WorkspaceId, handler: ContentHandler): Disposable {
    if (this.#handlers.has(workspaceId)) {
      throw new Error(`Resource transport already registered: ${workspaceId}`);
    }
    this.#handlers.set(workspaceId, handler);
    return disposable(() => {
      if (this.#handlers.get(workspaceId) === handler) {
        this.#handlers.delete(workspaceId);
      }
    });
  }

  /** Dispatch through the handler protected by the caller's workspace guard. */
  dispatch(workspaceId: WorkspaceId, request: Request): Promise<Response> {
    const handler = this.#handlers.get(workspaceId);
    if (!handler) {
      return Promise.resolve(
        new Response("Workspace resources are unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    }
    return Promise.resolve(handler({ kind: "resource", request }));
  }
}
