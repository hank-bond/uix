// resource serving contributions.
//
// Resources are request/response byte producers addressed by URL scheme. The
// current local transport is Electron custom protocols; a hosted runtime can
// adapt the same contributions to HTTP routes.

import { protocol } from "electron";

import type { ResourceCanonicalId } from "#shared/resource-canonical-id";
import { toResourceCanonicalId } from "#shared/resource-canonical-id";
import { toContributionId, type ContributionId } from "#shared/contribution-id";

import { DisposableBag, disposable } from "../lifecycle";

export interface ResourceSchemeContribution {
  /** Local resource name; the substrate derives the URL scheme as `${featureId}-${name}`. */
  name: string;
  privileges: Electron.CustomScheme["privileges"];
}

export interface ResourceContribution {
  /** Local resource name; the substrate derives the URL scheme as `${featureId}-${name}`. */
  name: string;
  handle: (request: Request) => Response | Promise<Response>;
}

export interface ResourceSchemeContributionGroup {
  featureId: string;
  contributions: readonly ResourceSchemeContribution[];
}

interface ResourceSchemeRegistration {
  contributionId: ContributionId;
  canonicalId: ResourceCanonicalId;
  privileges: Electron.CustomScheme["privileges"];
}

interface ResourceRegistration {
  contributionId: ContributionId;
  canonicalId: ResourceCanonicalId;
  handle: (request: Request) => Response | Promise<Response>;
}

export type ResourceSchemeRegistrar = (
  schemes: Electron.CustomScheme[],
) => void;

export type ResourceTransportHandle = (
  scheme: ResourceCanonicalId,
  handle: (request: Request) => Response | Promise<Response>,
) => void;

export type ResourceTransportUnhandle = (scheme: ResourceCanonicalId) => void;

export interface ResourceRegistryOptions {
  handle?: ResourceTransportHandle;
  unhandle?: ResourceTransportUnhandle;
}

export function registerResourceSchemeContributions(
  groups: readonly ResourceSchemeContributionGroup[],
  register: ResourceSchemeRegistrar = (schemes) =>
    protocol.registerSchemesAsPrivileged(schemes),
): void {
  const contributionIds = new Set<ContributionId>();
  const canonicalIds = new Set<ResourceCanonicalId>();
  const electronSchemes: Electron.CustomScheme[] = [];

  for (const group of groups) {
    for (const contribution of group.contributions) {
      const registration = toResourceSchemeRegistration(
        group.featureId,
        contribution,
      );
      if (contributionIds.has(registration.contributionId)) {
        throw new Error(
          `Resource scheme contribution already registered: ${registration.contributionId as string}`,
        );
      }
      if (canonicalIds.has(registration.canonicalId)) {
        throw new Error(
          `Resource scheme already registered: ${registration.canonicalId as string}`,
        );
      }
      contributionIds.add(registration.contributionId);
      canonicalIds.add(registration.canonicalId);
      electronSchemes.push({
        scheme: registration.canonicalId,
        privileges: registration.privileges,
      });
    }
  }

  if (electronSchemes.length > 0) register(electronSchemes);
}

export class ResourceRegistry {
  readonly #handle: ResourceTransportHandle;
  readonly #unhandle: ResourceTransportUnhandle;
  readonly #contributionIds = new Set<ContributionId>();
  readonly #canonicalIds = new Set<ResourceCanonicalId>();

  constructor(opts: ResourceRegistryOptions = {}) {
    this.#handle = opts.handle ?? ((scheme, fn) => protocol.handle(scheme, fn));
    this.#unhandle = opts.unhandle ?? ((scheme) => protocol.unhandle(scheme));
  }

  register(registration: ResourceRegistration): Disposable {
    if (this.#contributionIds.has(registration.contributionId)) {
      throw new Error(
        `Resource contribution already registered: ${registration.contributionId as string}`,
      );
    }
    if (this.#canonicalIds.has(registration.canonicalId)) {
      throw new Error(
        `Resource scheme already handled: ${registration.canonicalId as string}`,
      );
    }

    this.#contributionIds.add(registration.contributionId);
    this.#canonicalIds.add(registration.canonicalId);
    this.#handle(registration.canonicalId, registration.handle);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      this.#unhandle(registration.canonicalId);
      this.#contributionIds.delete(registration.contributionId);
      this.#canonicalIds.delete(registration.canonicalId);
    });
  }
}

export function createResourceRegistry(
  opts: ResourceRegistryOptions = {},
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

function toResourceSchemeRegistration(
  featureId: string,
  contribution: ResourceSchemeContribution,
): ResourceSchemeRegistration {
  return {
    contributionId: toContributionId(featureId, "resource", contribution.name),
    canonicalId: toResourceCanonicalId(featureId, contribution.name),
    privileges: contribution.privileges,
  };
}

function toResourceRegistration(
  featureId: string,
  contribution: ResourceContribution,
): ResourceRegistration {
  return {
    contributionId: toContributionId(featureId, "resource", contribution.name),
    canonicalId: toResourceCanonicalId(featureId, contribution.name),
    handle: contribution.handle,
  };
}
