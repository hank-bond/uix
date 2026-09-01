// Electron host adapter for the substrate resource protocol.
//
// The runtime's ResourceRegistry stays transport-neutral. This module is the
// Electron side of that seam: it registers the privileged `uix-resource`
// scheme before app ready and binds protocol.handle to the runtime's
// dispatcher. Scheme-level CORS support permits CORS-mode requests to reach
// handlers. Each response remains responsible for granting an origin.

import { protocol } from "electron";

import { ResourceProtocolScheme } from "@uix/api/resource-routes";
import type { ResourceTransportRegistrar } from "@uix/runtime/resource-registry";

import { disposable } from "./lifecycle";

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

/** Bind one workspace runtime's resource dispatcher to the Electron protocol. */
export function createElectronResourceTransport(): ResourceTransportRegistrar {
  return (scheme, handler) => {
    protocol.handle(scheme, handler);
    return disposable(() => {
      protocol.unhandle(scheme);
    });
  };
}
