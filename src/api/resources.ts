// resource URL builder and contribution type.
//
// ResourceContribution is the type feature authors declare in their
// FeatureContributions.resources array; the substrate registers and dispatches
// requests through the ResourceRegistry.
//
// ResourceAddressBuilder is the substrate-provided way for features to produce
// transport URLs and origins from a resource route declaration without
// importing substrate internals. One builder per resource contribution — create
// it once in shared code, pass `.route` into the ResourceContribution and call
// `.url()` / `.origin()` from workspace renderer code.

import type { TSchema } from "typebox";

import {
  encodeResourceOrigin,
  encodeResourceUrl,
  normalizeResourceRoute,
  type NormalizedResourceRoute,
  type ResourceOrigin,
  type ResourceRouteParams,
  type ResourceUrl,
} from "./resource-routes";

export type {
  ResourceRouteParamValue,
  ResourceRouteParams,
  ResourceUrl,
} from "./resource-routes";

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

export interface ResourceRouteDefinition<Query extends TSchema = TSchema> {
  featureId: string;
  name: string;
  path: string;
  query?: Query;
  origin: ResourceOrigin;
}

export interface ResourceAddressBuilder<Query extends TSchema = TSchema> {
  /** The normalized route — pass as the `route` field on a ResourceContribution. */
  route: NormalizedResourceRoute<Query>;
  /** Produce a transport URL for iframe src, fetch, etc. */
  url(input: {
    workspaceId: string;
    params?: ResourceRouteParams;
    query?: unknown;
  }): ResourceUrl;
  /** Produce the origin string for postMessage security checks. */
  origin(workspaceId: string): string;
}

export function createResourceAddressBuilder<const Query extends TSchema>(
  definition: ResourceRouteDefinition<Query>,
): ResourceAddressBuilder<Query> {
  const { featureId, name, path, query, origin } = definition;
  const route = normalizeResourceRoute({ path, query, origin });

  return {
    route,
    url({ workspaceId, params, query: queryValues }) {
      return encodeResourceUrl(route, {
        featureId,
        name,
        workspaceId,
        params: params ?? {},
        query: queryValues,
      });
    },
    origin(workspaceId) {
      return encodeResourceOrigin(route, featureId, workspaceId).origin;
    },
  };
}
