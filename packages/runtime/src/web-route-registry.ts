// Stores web route contracts and handlers for a Workspace or viewpoint.

import { Type } from "typebox";
import { Value } from "typebox/value";

import { isIdToken } from "@uix/api/contribution-id";
import {
  decodeRouteUrlParts,
  listRoutePatternParams,
  matchRoutePath,
  type NormalizedRoutePattern,
  normalizeRoutePattern,
  toRoutePatternIdentity,
} from "@uix/api/path-pattern";
import type {
  WebRouteContract,
  WebRouteContribution,
  WebRouteResponse,
} from "@uix/api/web-routes";

import { disposable, DisposableBag } from "./lifecycle";

const WebRouteCanonicalIdBrand: unique symbol = Symbol("WebRouteCanonicalId");

/** Live identity derived from namespace, method, and local pattern. */
type WebRouteCanonicalId = string & {
  readonly [WebRouteCanonicalIdBrand]: true;
};

interface WebRouteRequest {
  readonly method: string;
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}

interface ResolvedWebRouteRequest {
  readonly canonicalId: WebRouteCanonicalId;
  readonly params: unknown;
  readonly query: unknown;
}

type WebRouteResolution =
  | { readonly ok: true; readonly value: ResolvedWebRouteRequest }
  | {
      readonly ok: false;
      readonly status: 400 | 404 | 405;
      readonly reason: string;
    };

interface RegisteredContract {
  readonly canonicalId: WebRouteCanonicalId;
  readonly contract: WebRouteContract;
  readonly pattern: NormalizedRoutePattern;
}

/** Workspace-owned table of contracts admitted under a derived or reserved namespace. */
export class WebRouteContractRegistry {
  readonly #contracts = new Map<WebRouteCanonicalId, RegisteredContract>();
  readonly #namespaceContracts = new Map<string, RegisteredContract[]>();

  register(namespace: string, contract: WebRouteContract): Disposable {
    assertWebRouteNamespace(namespace);
    const normalized = normalizeWebRouteContract(contract);
    const canonicalId = toWebRouteCanonicalId(namespace, contract, normalized);
    if (this.#contracts.has(canonicalId)) {
      throw new Error(
        `Web route already registered in namespace ${namespace}: ${contract.method} ${contract.path}`,
      );
    }

    const registered = { canonicalId, contract, pattern: normalized };
    this.#contracts.set(canonicalId, registered);
    const namespaceContracts = this.#namespaceContracts.get(namespace) ?? [];
    namespaceContracts.push(registered);
    this.#namespaceContracts.set(namespace, namespaceContracts);

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      if (this.#contracts.get(canonicalId) !== registered) return;
      this.#contracts.delete(canonicalId);
      const current = this.#namespaceContracts.get(namespace);
      if (!current) return;
      const next = current.filter((candidate) => candidate !== registered);
      if (next.length === 0) this.#namespaceContracts.delete(namespace);
      else this.#namespaceContracts.set(namespace, next);
    });
  }

  /** Resolve one namespace-local request without selecting or invoking a handler. */
  resolve(namespace: string, request: WebRouteRequest): WebRouteResolution {
    const contracts = this.#namespaceContracts.get(namespace) ?? [];
    let hasPathMatch = false;
    for (const registered of contracts) {
      const pathMatch = matchRoutePath(registered.pattern, request.pathname);
      if (!pathMatch.ok) {
        if (pathMatch.status === 404) continue;
        return pathMatch;
      }
      hasPathMatch = true;
      if (registered.contract.method !== request.method) continue;

      const decoded = decodeRouteUrlParts(registered.pattern, request);
      if (!decoded.ok) return decoded;
      try {
        return {
          ok: true,
          value: {
            canonicalId: registered.canonicalId,
            params: Value.Parse(
              registered.contract.params,
              decoded.value.params,
            ),
            query: decoded.value.query,
          },
        };
      } catch {
        return {
          ok: false,
          status: 400,
          reason: "Invalid web route path params.",
        };
      }
    }
    return hasPathMatch
      ? {
          ok: false,
          status: 405,
          reason: "Web route method is not allowed.",
        }
      : {
          ok: false,
          status: 404,
          reason: "Unknown web route.",
        };
  }

  listCanonicalIds(): readonly WebRouteCanonicalId[] {
    return [...this.#contracts.keys()];
  }
}

/** Handler table whose owning instance establishes its execution scope. */
export class WebRouteHandlerRegistry {
  readonly #handlers = new Map<WebRouteCanonicalId, WebRouteContribution>();

  register(namespace: string, contribution: WebRouteContribution): Disposable {
    assertWebRouteNamespace(namespace);
    const normalized = normalizeWebRouteContract(contribution.contract);
    const canonicalId = toWebRouteCanonicalId(
      namespace,
      contribution.contract,
      normalized,
    );
    if (this.#handlers.has(canonicalId)) {
      throw new Error(
        `Web route handler already registered in namespace ${namespace}: ${contribution.contract.method} ${contribution.contract.path}`,
      );
    }

    this.#handlers.set(canonicalId, contribution);
    return disposable(() => {
      if (this.#handlers.get(canonicalId) === contribution) {
        this.#handlers.delete(canonicalId);
      }
    });
  }

  async invoke(
    request: ResolvedWebRouteRequest,
    signal: AbortSignal,
  ): Promise<WebRouteResponse> {
    const contribution = this.#handlers.get(request.canonicalId);
    if (!contribution) {
      throw new Error(
        `Web route handler is unavailable: ${request.canonicalId}`,
      );
    }

    const issuedResponses = new WeakSet();
    const responder: Parameters<WebRouteContribution["handler"]>[1] = (
      status: unknown,
      body: unknown,
    ) => {
      if (status !== 200 || typeof body !== "string") {
        throw new Error("Invalid complete HTML document response");
      }
      const descriptor = contribution.contract.responses[status] as {
        readonly content?: unknown;
      };
      if (descriptor.content !== "html-document") {
        throw new Error(
          `Web route status ${String(status)} does not declare an HTML document response`,
        );
      }
      const response = Object.freeze({
        status,
        content: "html-document" as const,
        body,
      }) as WebRouteResponse;
      issuedResponses.add(response);
      return response;
    };
    const handlerRequest = {
      params: request.params,
      query: request.query,
      signal,
    };
    const response = await contribution.handler(handlerRequest, responder);
    if (
      typeof response !== "object" ||
      response === null ||
      !issuedResponses.has(response)
    ) {
      throw new Error(
        "Web route handler must return a response from its bound responder",
      );
    }
    return response as WebRouteResponse;
  }

  listCanonicalIds(): readonly WebRouteCanonicalId[] {
    return [...this.#handlers.keys()];
  }
}

/** Admit one namespace's route contracts as one rollback-safe unit. */
export function registerWebRouteContracts(
  registry: WebRouteContractRegistry,
  namespace: string,
  contracts: readonly WebRouteContract[],
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contract of contracts) {
      bag.add(registry.register(namespace, contract));
    }
    return bag;
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}

/** Bind one namespace's route handlers as one rollback-safe unit. */
export function registerWebRouteHandlers(
  registry: WebRouteHandlerRegistry,
  namespace: string,
  contributions: readonly WebRouteContribution[],
): Disposable {
  const bag = new DisposableBag();
  try {
    for (const contribution of contributions) {
      bag.add(registry.register(namespace, contribution));
    }
    return bag;
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}

// Contributions are loaded JavaScript, so registration validates authored
// values even when the author-facing TypeScript contract is narrower.
function assertWebRouteNamespace(namespace: string): void {
  if (!isIdToken(namespace)) {
    throw new Error(`Invalid web route namespace: ${namespace}`);
  }
}

function normalizeWebRouteContract(
  contract: WebRouteContract,
): NormalizedRoutePattern {
  const method: unknown = contract.method;
  if (method !== "GET") {
    throw new Error(`Unsupported web route method: ${String(method)}`);
  }
  if (!Type.IsObject(contract.params)) {
    throw new Error("Web route params schema must be a Type.Object");
  }
  if (contract.query !== undefined && !Type.IsObject(contract.query)) {
    throw new Error("Web route query schema must be a Type.Object");
  }
  const unsupportedRequest = contract as WebRouteContract & {
    readonly headers?: unknown;
    readonly body?: unknown;
  };
  if (
    unsupportedRequest.headers !== undefined ||
    unsupportedRequest.body !== undefined
  ) {
    throw new Error("Web route request headers and bodies are not supported");
  }
  const responseEntries = Object.entries(
    contract.responses as Record<
      string,
      { readonly content?: unknown; readonly headers?: unknown }
    >,
  );
  if (
    responseEntries.length !== 1 ||
    responseEntries[0]?.[0] !== "200" ||
    responseEntries[0]?.[1]?.content !== "html-document" ||
    responseEntries[0]?.[1]?.headers !== undefined
  ) {
    throw new Error("Web routes must declare one 200 HTML document response");
  }

  const pattern = normalizeRoutePattern({
    path: contract.path,
    ...(contract.query && { query: contract.query }),
  });
  const patternParams = listRoutePatternParams(pattern).map(({ name }) => name);
  const schemaParams = Object.keys(contract.params.properties);
  if (
    patternParams.length !== schemaParams.length ||
    patternParams.some((name) => !schemaParams.includes(name))
  ) {
    throw new Error(
      `Web route path params do not match their schema: ${contract.path}`,
    );
  }
  return pattern;
}

function toWebRouteCanonicalId(
  namespace: string,
  contract: WebRouteContract,
  pattern: NormalizedRoutePattern,
): WebRouteCanonicalId {
  return `${namespace}\u0000${contract.method}\u0000${toRoutePatternIdentity(pattern)}` as WebRouteCanonicalId;
}
