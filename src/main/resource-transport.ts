// Binds the substrate resource protocol to Electron's custom protocol machinery.
//
// The neutral dispatch lives in `@uix/runtime`'s ResourceRegistry. This file
// is the Electron adapter: scheme privileges registered before app ready, and
// a protocol.handle binding that feeds requests to the registry's dispatch.

import { protocol } from "electron";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import { disposable, type ResourceTransportRegistrar } from "@uix/runtime";

export type ResourceSchemeRegistrar = (
  schemes: Electron.CustomScheme[],
) => void;

/**
 * Register the privileged substrate resource scheme before Electron is ready.
 *
 * Scheme-level CORS support permits CORS-mode requests to reach handlers. Each
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
        // at the network layer. Module scripts (the surface pipeline)
        // are always fetched in CORS mode. Actual grants stay per-response:
        // the surface routes echo non-uix-resource origins only.
        corsEnabled: true,
      },
    },
  ]);
}

/** Bind the scheme to the registry's dispatch and unbind on disposal. */
export const registerResourceTransportHandler: ResourceTransportRegistrar = (
  scheme,
  handler,
) => {
  protocol.handle(scheme, handler);
  return disposable(() => {
    protocol.unhandle(scheme);
  });
};
