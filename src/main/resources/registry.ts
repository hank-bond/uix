// resource serving contributions.
//
// Resources are request/response byte producers addressed by substrate-owned
// resource URLs. The local transport is one Electron custom protocol
// (`uix-resource://...`); a hosted runtime can adapt the same route metadata to
// HTTP routes.

import { protocol } from "electron";
import type { TSchema } from "typebox";

import type { ResourceCanonicalId } from "#shared/resource-canonical-id";
import { toResourceCanonicalId } from "#shared/resource-canonical-id";
import { toContributionId, type ContributionId } from "#shared/contribution-id";
import {
  decodeResourceUrl,
  ResourceProtocolScheme,
  type DecodedResourceUrl,
  type NormalizedResourceRoute,
  type ResourceRouteParams,
} from "#shared/resource-routes";

import { DisposableBag, disposable } from "../lifecycle";

export interface ResourceRequestContext {
  request: Request;
  params: ResourceRouteParams;
  query: unknown;
}

export interface ResourceContribution<Query extends TSchema = TSchema> {
  /** Local resource name; the substrate derives the resource type as `${featureId}-${name}`. */
  name: string;
  /** Normalized route from a `createResourceAddressBuilder` call — pass `builder.route`. */
  route: NormalizedResourceRoute<Query>;
  handle: (ctx: ResourceRequestContext) => Response | Promise<Response>;
}

interface ResourceRegistration {
  featureId: string;
  name: string;
  contributionId: ContributionId;
  canonicalId: ResourceCanonicalId;
  route: NormalizedResourceRoute;
  handle: (ctx: ResourceRequestContext) => Response | Promise<Response>;
}

export type ResourceSchemeRegistrar = (
  schemes: Electron.CustomScheme[],
) => void;

export type ResourceTransportHandle = (
  scheme: typeof ResourceProtocolScheme,
  handle: (request: Request) => Response | Promise<Response>,
) => void;

export type ResourceTransportUnhandle = (
  scheme: typeof ResourceProtocolScheme,
) => void;

export interface ResourceRegistryOptions {
  workspaceId: string;
  handle?: ResourceTransportHandle;
  unhandle?: ResourceTransportUnhandle;
}

export function registerResourceProtocol(
  register: ResourceSchemeRegistrar = (schemes) =>
    protocol.registerSchemesAsPrivileged(schemes),
): void {
  register([
    {
      scheme: ResourceProtocolScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export class ResourceRegistry implements Disposable {
  readonly #workspaceId: string;
  readonly #unhandle: ResourceTransportUnhandle;
  readonly #canonicalIds = new Set<ResourceCanonicalId>();
  readonly #registrations = new Map<
    ResourceCanonicalId,
    ResourceRegistration
  >();
  #disposed = false;

  constructor(opts: ResourceRegistryOptions) {
    this.#workspaceId = opts.workspaceId;
    const handle = opts.handle ?? ((scheme, fn) => protocol.handle(scheme, fn));
    this.#unhandle = opts.unhandle ?? ((scheme) => protocol.unhandle(scheme));
    handle(ResourceProtocolScheme, (request) => this.#dispatch(request));
  }

  register(registration: ResourceRegistration): Disposable {
    if (this.#disposed) {
      throw new Error("Resource registry is disposed");
    }
    if (this.#canonicalIds.has(registration.canonicalId)) {
      throw new Error(
        `Resource already registered: ${registration.canonicalId as string}`,
      );
    }

    this.#canonicalIds.add(registration.canonicalId);
    this.#registrations.set(registration.canonicalId, registration);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      this.#canonicalIds.delete(registration.canonicalId);
      this.#registrations.delete(registration.canonicalId);
    });
  }

  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#registrations.clear();
    this.#canonicalIds.clear();
    this.#unhandle(ResourceProtocolScheme);
  }

  async #dispatch(request: Request): Promise<Response> {
    let badRequestReason: string | null = null;

    for (const registration of this.#registrations.values()) {
      const decoded = decodeResourceUrl(registration.route, {
        featureId: registration.featureId,
        name: registration.name,
        workspaceId: this.#workspaceId,
        url: request.url,
      });
      if (decoded.ok) {
        return registration.handle(toRequestContext(request, decoded.value));
      }
      if (decoded.status === 400) {
        badRequestReason = decoded.reason;
      }
    }

    if (badRequestReason) return textResponse(badRequestReason, 400);
    return textResponse("Resource not found", 404);
  }
}

export function createResourceRegistry(
  opts: ResourceRegistryOptions,
): ResourceRegistry {
  return new ResourceRegistry(opts);
}

export function registerResourceContributions(
  registry: ResourceRegistry,
  featureId: string,
  contributions: readonly ResourceContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(registry.register(toResourceRegistration(featureId, contribution)));
  }
  return bag;
}

function toResourceRegistration(
  featureId: string,
  contribution: ResourceContribution,
): ResourceRegistration {
  return {
    featureId,
    name: contribution.name,
    contributionId: toContributionId(featureId, "resource", contribution.name),
    canonicalId: toResourceCanonicalId(featureId, contribution.name),
    route: contribution.route,
    handle: contribution.handle,
  };
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
