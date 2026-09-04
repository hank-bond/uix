// Typed web route contracts and handler contributions.
//
// Contracts contain only local route vocabulary. Their installation derives
// namespace and execution scope. The runtime provides routing identity,
// decoded input, cancellation, and a contract-bound responder.

import type { Static, TObject } from "typebox";

/** Schema-only declaration shared by backend and browser code. */
export interface WebRouteContract {
  readonly method: "GET";
  readonly path: string;
  readonly params: TObject;
  readonly query?: TObject;
  readonly responses: Readonly<{
    200: { readonly content: "html-document" };
  }>;
}

/** Preserve authored schemas through route definition. */
export function defineWebRoute<const Contract extends WebRouteContract>(
  contract: Contract,
): Contract {
  return contract;
}

type ObjectValue<Schema> = Schema extends TObject
  ? Static<Schema>
  : Record<string, never>;

type ContractQuery<Contract extends WebRouteContract> = Contract extends {
  readonly query: infer Query extends TObject;
}
  ? Query
  : undefined;

/** Typed input delivered after the runtime has decoded and validated a route. */
export interface WebRouteHandlerRequest<Contract extends WebRouteContract> {
  readonly params: ObjectValue<Contract["params"]>;
  readonly query: ObjectValue<ContractQuery<Contract>>;
  readonly signal: AbortSignal;
}

/** Host-neutral complete HTML document response. */
export interface WebRouteResponse {
  readonly status: 200;
  readonly content: "html-document";
  readonly body: string;
}

/** Responder for the route shape supported in this version. */
export type WebRouteResponder = (status: 200, body: string) => WebRouteResponse;

/** A handler inferred from one shared schema-only route contract. */
export type WebRouteHandler<Contract extends WebRouteContract> = (
  request: WebRouteHandlerRequest<Contract>,
  respond: WebRouteResponder,
) => WebRouteResponse | Promise<WebRouteResponse>;

/** Erased contract-and-handler contribution shape. */
export interface WebRouteContribution {
  readonly contract: WebRouteContract;
  readonly handler: (
    request: {
      readonly params: unknown;
      readonly query: unknown;
      readonly signal: AbortSignal;
    },
    respond: WebRouteResponder,
  ) => unknown;
}

/** Pair one shared route contract with its inferred handler. */
export function withWebRouteHandler<const Contract extends WebRouteContract>(
  contract: Contract,
  handler: WebRouteHandler<Contract>,
): WebRouteContribution {
  return {
    contract,
    handler: handler as unknown as WebRouteContribution["handler"],
  };
}
