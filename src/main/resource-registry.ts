// Routes resource URLs to the active feature handlers through one validated protocol boundary.
//
// Resource declarations remain transport-neutral even though the default adapter uses Electron's custom protocol. A malformed URL recognized by a route yields 400, while a URL matching no registered route yields 404.

import { protocol } from "electron";

import {
  type ContributionId,
  toContributionId,
} from "@uix/api/contribution-id";
import {
  type DecodedResourceUrl,
  decodeResourceUrl,
  type NormalizedResourceRoute,
  ResourceProtocolScheme,
} from "@uix/api/resource-routes";
import type {
  ResourceContribution,
  ResourceRequestContext,
} from "@uix/api/resources";
import type { ResourceCanonicalId } from "#shared/resource-canonical-id";
import { toResourceCanonicalId } from "#shared/resource-canonical-id";

import { disposable, DisposableBag } from "./lifecycle";

interface ResolvedResourceContribution {
  readonly featureId: string;
  readonly name: string;
  readonly contributionId: ContributionId;
  readonly canonicalId: ResourceCanonicalId;
  readonly route: NormalizedResourceRoute;
  readonly handler: (
    ctx: ResourceRequestContext,
  ) => Response | Promise<Response>;
}

export type ResourceSchemeRegistrar = (
  schemes: Electron.CustomScheme[],
) => void;

export type ResourceTransportRegistrar = (
  scheme: typeof ResourceProtocolScheme,
  handler: (request: Request) => Response | Promise<Response>,
) => Disposable;

export interface ResourceRegistryOptions {
  workspaceId: string;
  transportRegistrar?: ResourceTransportRegistrar;
}

/**
 * Register the privileged substrate resource scheme before Electron is ready.
 *
 * Scheme-level CORS support permits CORS-mode requests to reach handlers; each
 * response remains responsible for granting an origin.
 */
export function registerResourceProtocol(
  registrar: ResourceSchemeRegistrar = (schemes) => {
    protocol.registerSchemesAsPrivileged(schemes);
  },
): void {
  registrar([
    {
      scheme: ResourceProtocolScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // Without this Chromium refuses CORS-mode requests *to* the scheme
        // at the network layer; module scripts (the surface pipeline)
        // are always fetched in CORS mode. Actual grants stay per-response:
        // the surface routes echo non-uix-resource origins only.
        corsEnabled: true,
      },
    },
  ]);
}

/** Own live feature routes and the application-wide transport handler. */
export class ResourceRegistry implements Disposable {
  readonly #workspaceId: string;
  readonly #transportDisposable: Disposable;
  readonly #canonicalIds = new Set<ResourceCanonicalId>();
  readonly #registeredResources = new Map<
    ResourceCanonicalId,
    ResolvedResourceContribution
  >();
  #disposed = false;

  constructor(opts: ResourceRegistryOptions) {
    this.#workspaceId = opts.workspaceId;
    const transportRegistrar =
      opts.transportRegistrar ?? registerResourceTransportHandler;
    this.#transportDisposable = transportRegistrar(
      ResourceProtocolScheme,
      (request) => this.#dispatch(request),
    );
  }

  /** Register one resolved route and return a lifetime for that exact route. */
  register(resolvedContribution: ResolvedResourceContribution): Disposable {
    if (this.#disposed) {
      throw new Error("Resource registry is disposed");
    }
    if (this.#canonicalIds.has(resolvedContribution.canonicalId)) {
      throw new Error(
        `Resource already registered: ${resolvedContribution.canonicalId as string}`,
      );
    }

    this.#canonicalIds.add(resolvedContribution.canonicalId);
    this.#registeredResources.set(
      resolvedContribution.canonicalId,
      resolvedContribution,
    );

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      this.#canonicalIds.delete(resolvedContribution.canonicalId);
      this.#registeredResources.delete(resolvedContribution.canonicalId);
    });
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#registeredResources.clear();
    this.#canonicalIds.clear();
    this.#transportDisposable[Symbol.dispose]();
  }

  async #dispatch(request: Request): Promise<Response> {
    let badRequestReason: string | null = null;

    for (const contribution of this.#registeredResources.values()) {
      const decoded = decodeResourceUrl(contribution.route, {
        featureId: contribution.featureId,
        name: contribution.name,
        workspaceId: this.#workspaceId,
        url: request.url,
      });
      if (decoded.ok) {
        return contribution.handler(toRequestContext(request, decoded.value));
      }
      if (decoded.status === 400) {
        badRequestReason = decoded.reason;
      }
    }

    if (badRequestReason) return textResponse(badRequestReason, 400);
    return textResponse("Resource not found", 404);
  }
}

/** Register one feature's resource routes as a rollback-safe lifetime. */
export function registerResourceContributions(
  registry: ResourceRegistry,
  featureId: string,
  contributions: readonly ResourceContribution[],
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      bag.add(
        registry.register(resolveResourceContribution(featureId, contribution)),
      );
    }
    return bag;
  } catch (err) {
    bag[Symbol.dispose]();
    throw err;
  }
}

function resolveResourceContribution(
  featureId: string,
  contribution: ResourceContribution,
): ResolvedResourceContribution {
  return {
    featureId,
    name: contribution.name,
    contributionId: toContributionId(featureId, "resource", contribution.name),
    canonicalId: toResourceCanonicalId(featureId, contribution.name),
    route: contribution.route,
    handler: contribution.handler,
  };
}

function registerResourceTransportHandler(
  scheme: typeof ResourceProtocolScheme,
  handler: (request: Request) => Response | Promise<Response>,
): Disposable {
  protocol.handle(scheme, handler);
  return disposable(() => {
    protocol.unhandle(scheme);
  });
}

function toRequestContext(
  request: Request,
  decoded: DecodedResourceUrl,
): ResourceRequestContext {
  return {
    request,
    params: decoded.params,
    query: decoded.query,
  };
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
