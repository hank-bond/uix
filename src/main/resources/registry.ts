// UIX cockpit — resource serving contributions.
//
// Resources are request/response byte producers addressed by URL scheme. The
// current local transport is Electron custom protocols; a hosted runtime can
// adapt the same contributions to HTTP routes.

import { protocol } from "electron";

import { DisposableBag, disposable } from "../lifecycle";

export interface ResourceSchemeContribution {
  id: string;
  scheme: string;
  privileges: Electron.CustomScheme["privileges"];
}

export interface ResourceContribution {
  id: string;
  scheme: string;
  handle: (request: Request) => Response | Promise<Response>;
}

export type ResourceSchemeRegistrar = (
  schemes: Electron.CustomScheme[],
) => void;

export type ResourceTransportHandle = (
  scheme: string,
  handle: (request: Request) => Response | Promise<Response>,
) => void;

export type ResourceTransportUnhandle = (scheme: string) => void;

export interface ResourceRegistry {
  register(contribution: ResourceContribution): Disposable;
}

export interface ResourceRegistryOptions {
  handle?: ResourceTransportHandle;
  unhandle?: ResourceTransportUnhandle;
}

export function registerResourceSchemeContributions(
  contributions: readonly ResourceSchemeContribution[],
  register: ResourceSchemeRegistrar = (schemes) =>
    protocol.registerSchemesAsPrivileged(schemes),
): void {
  const ids = new Set<string>();
  const schemes = new Set<string>();
  const electronSchemes: Electron.CustomScheme[] = [];

  for (const contribution of contributions) {
    if (ids.has(contribution.id)) {
      throw new Error(
        `Resource scheme contribution already registered: ${contribution.id}`,
      );
    }
    if (schemes.has(contribution.scheme)) {
      throw new Error(
        `Resource scheme already registered: ${contribution.scheme}`,
      );
    }
    ids.add(contribution.id);
    schemes.add(contribution.scheme);
    electronSchemes.push({
      scheme: contribution.scheme,
      privileges: contribution.privileges,
    });
  }

  if (electronSchemes.length > 0) register(electronSchemes);
}

export function createResourceRegistry(
  opts: ResourceRegistryOptions = {},
): ResourceRegistry {
  const handle = opts.handle ?? ((scheme, fn) => protocol.handle(scheme, fn));
  const unhandle = opts.unhandle ?? ((scheme) => protocol.unhandle(scheme));
  const ids = new Set<string>();
  const schemes = new Set<string>();

  return {
    register(contribution) {
      if (ids.has(contribution.id)) {
        throw new Error(
          `Resource contribution already registered: ${contribution.id}`,
        );
      }
      if (schemes.has(contribution.scheme)) {
        throw new Error(
          `Resource scheme already handled: ${contribution.scheme}`,
        );
      }

      ids.add(contribution.id);
      schemes.add(contribution.scheme);
      handle(contribution.scheme, contribution.handle);

      let disposed = false;
      return disposable(() => {
        if (disposed) return;
        disposed = true;
        unhandle(contribution.scheme);
        ids.delete(contribution.id);
        schemes.delete(contribution.scheme);
      });
    },
  };
}

export function registerResourceContributions(
  registry: ResourceRegistry,
  contributions: readonly ResourceContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(registry.register(contribution));
  }
  return bag;
}
