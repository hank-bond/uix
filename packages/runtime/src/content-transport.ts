// Defines the host content boundary shared by workspace resources and viewpoint web routes.

import type { ViewpointWebRequest } from "./workspace";

/** Present host-decoded content without selecting an Agent in the host. */
export type ContentRequest =
  | { readonly kind: "resource"; readonly request: Request }
  | {
      readonly kind: "viewpoint";
      readonly request: ViewpointWebRequest;
    };

/** Register one runtime's content handler for its complete lifetime. */
export type ContentTransportRegistrar = (
  handler: (request: ContentRequest) => Response | Promise<Response>,
) => Disposable;
