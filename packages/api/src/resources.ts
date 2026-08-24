// Resource address capability and contribution type.
//
// ResourceContribution is the type feature authors declare in their
// WorkspaceFeatureContributions.resources array. The substrate registers and dispatches
// requests through the ResourceRegistry.
//
// ResourceAddressHandle is the substrate-provided capability for features to
// produce transport URLs and origins from a resource route declaration without
// importing substrate internals. Create one handle per resource contribution
// in shared code, pass `.route` into the ResourceContribution, and call
// `.toUrl()` / `.toOrigin()` from workspace renderer code.

import type { TSchema } from "typebox";

import {
  encodeResourceOrigin,
  encodeResourceUrl,
  type NormalizedResourceRoute,
  normalizeResourceRoute,
  type ResourceOrigin,
  type ResourceRouteParams,
  type ResourceUrl,
} from "./resource-routes";

export type {
  ResourceRouteParams,
  ResourceRouteParamValue,
  ResourceUrl,
} from "./resource-routes";

export interface ResourceRequestContext {
  request: Request;
  params: ResourceRouteParams;
  query: unknown;
}

export interface ResourceContribution<Query extends TSchema = TSchema> {
  /** Local resource name. The substrate derives the resource type as `${featureId}-${name}`. */
  name: string;
  /** Normalized route from a `createResourceAddressHandle` call. Pass `handle.route`. */
  route: NormalizedResourceRoute<Query>;
  handler: (ctx: ResourceRequestContext) => Response | Promise<Response>;
}

export interface ResourceRouteDefinition<Query extends TSchema = TSchema> {
  featureId: string;
  name: string;
  path: string;
  query?: Query;
  origin: ResourceOrigin;
}

export interface ResourceAddressHandle<Query extends TSchema = TSchema> {
  /** The normalized route. Pass it as the `route` field on a ResourceContribution. */
  route: NormalizedResourceRoute<Query>;
  /** Produce a transport URL for iframe src, fetch, etc. */
  toUrl(input: {
    workspaceId: string;
    params?: ResourceRouteParams;
    query?: unknown;
  }): ResourceUrl;
  /** Produce the origin string for postMessage security checks. */
  toOrigin(workspaceId: string): string;
}

export function createResourceAddressHandle<const Query extends TSchema>(
  definition: ResourceRouteDefinition<Query>,
): ResourceAddressHandle<Query> {
  const { featureId, name, path, query, origin } = definition;
  const route = normalizeResourceRoute({ path, query, origin });

  return {
    route,
    toUrl({ workspaceId, params, query: queryValues }) {
      return encodeResourceUrl(route, {
        featureId,
        name,
        workspaceId,
        params: params ?? {},
        query: queryValues,
      });
    },
    toOrigin(workspaceId) {
      return encodeResourceOrigin(route, featureId, workspaceId).origin;
    },
  };
}
