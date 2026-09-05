// Typed web route contracts and handler contributions.
//
// Contracts contain only local route vocabulary. Their installation derives
// namespace and execution scope. The runtime provides routing identity,
// decoded input, cancellation, and a contract-bound responder.

import { type Static, type TObject, Type } from "typebox";

// These values are schemas, not request payloads. TypeBox owns their guard
// and static type. Admission does not interpret their nested declarations.
const TypeBoxObjectSchema = Type.Unsafe<TObject>(
  Type.Refine(
    Type.Unknown(),
    Type.IsObject,
    () => "Expected a Type.Object schema",
  ),
);

/** Structural admission schema shared with the author-facing contract type. */
export const WebRouteContractSchema = Type.Object(
  {
    method: Type.Literal("GET"),
    /** Use `/` or one literal, non-dot segment such as `/view`. Non-root paths cannot end in `/`. */
    path: Type.String(),
    /** Omit when the path has no parameters, as required for complete-page routes. */
    params: Type.Optional(TypeBoxObjectSchema),
    /** Omit when the route accepts no query input. Declare complete-page content selection here. */
    query: Type.Optional(TypeBoxObjectSchema),
    responses: Type.Object(
      {
        200: Type.Readonly(
          Type.Object(
            { content: Type.Readonly(Type.Literal("html-document")) },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

/** Schema-only declaration shared by backend and browser code. */
export type WebRouteContract = Readonly<Static<typeof WebRouteContractSchema>>;

/** Preserve authored schemas through route definition. */
export function defineWebRoute<const Contract extends WebRouteContract>(
  contract: Contract,
): Contract {
  return contract;
}

type InputValue<Schema> = Schema extends TObject
  ? Static<Schema>
  : Record<string, never>;

/** Typed input delivered after the runtime has decoded and validated a route. */
export interface WebRouteHandlerRequest<Contract extends WebRouteContract> {
  /** An empty object when the contract omits the path schema. */
  readonly params: InputValue<Contract["params"]>;
  /** An empty object when the contract omits the query schema. */
  readonly query: InputValue<Contract["query"]>;
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
