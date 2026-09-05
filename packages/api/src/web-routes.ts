// Typed web route contracts and handler contributions.
//
// Contracts contain only local route vocabulary. Their installation derives
// namespace and execution scope. The runtime provides routing identity,
// decoded input, cancellation, and a contract-bound responder.

import { type Static, type TObject, Type } from "typebox";

import type { FeatureWebRootUrl } from "./feature-web-root-url";
import {
  encodeRouteUrlParts,
  normalizeRoutePattern,
  type RoutePatternParams,
} from "./path-pattern";

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

type WebRouteParams<Contract extends WebRouteContract> = Contract extends {
  readonly params: infer Schema extends TObject;
}
  ? { readonly params: Static<Schema> }
  : { readonly params?: never };

type WebRouteQuery<Contract extends WebRouteContract> = Contract extends {
  readonly query: infer Schema extends TObject;
}
  ? { readonly query: Static<Schema> }
  : { readonly query?: never };

/** Typed values used to construct one route reference or physical URL. */
export type WebRouteValues<Contract extends WebRouteContract> =
  WebRouteParams<Contract> & WebRouteQuery<Contract>;

type WebRouteArguments<Contract extends WebRouteContract> = Contract extends
  | { readonly params: TObject }
  | { readonly query: TObject }
  ? readonly [values: WebRouteValues<Contract>]
  : readonly [values?: WebRouteValues<Contract>];

interface ErasedWebRouteValues {
  readonly params?: RoutePatternParams;
  readonly query?: unknown;
}

/** A route client already scoped to one feature and attachment-target generation. */
export interface WebRouteClient<Contract extends WebRouteContract> {
  /** Derive a physical browser URL using the client's retained feature root. */
  readonly toUrl: (...args: WebRouteArguments<Contract>) => string;
}

/**
 * Encode typed route values without host, workspace, feature, or binding
 * identity. The result is directory-relative so authored content can retain
 * its surrounding feature root.
 */
export function toWebRouteReference<const Contract extends WebRouteContract>(
  contract: Contract,
  ...args: WebRouteArguments<Contract>
): string {
  const values = args[0] as ErasedWebRouteValues | undefined;
  const pattern = normalizeRoutePattern({
    path: contract.path,
    ...(contract.query ? { query: contract.query } : {}),
  });
  const { pathname, search } = encodeRouteUrlParts(pattern, {
    params: values?.params,
    query: values?.query,
  });
  const relativePath = pathname === "/" ? "./" : pathname.slice(1);
  return `${relativePath}${search}`;
}

/**
 * Bind one shared route contract to a validated physical feature root.
 * Create a replacement client when the attachment target changes.
 * Retained clients continue to resolve addresses through their original root.
 */
export function createWebRouteClient<const Contract extends WebRouteContract>(
  contract: Contract,
  featureRootUrl: FeatureWebRootUrl,
): WebRouteClient<Contract> {
  return {
    toUrl: (...args): string => {
      const pageUrl = new URL(
        toWebRouteReference(contract, ...args),
        featureRootUrl,
      );
      if (toContainingDirectoryUrl(pageUrl).href !== featureRootUrl) {
        throw new Error(
          `Web route URL is outside its feature root: ${pageUrl.href}`,
        );
      }
      return pageUrl.href;
    },
  };
}

function toContainingDirectoryUrl(value: URL): URL {
  return new URL(".", value);
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
