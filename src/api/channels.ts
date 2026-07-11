import type { Static, TSchema } from "typebox";

export interface ChannelRequestLogOptions<Req, Res> {
  describeRequest?: (req: Req) => unknown;
  describeResponse?: (res: Res) => unknown;
}

export interface ChannelEventLogOptions<Event> {
  describeEvent?: (event: Event) => unknown;
}

/**
 * Schema-only request descriptor — the shared base between frontend and
 * backend. The frontend contract uses this directly; the backend
 * contribution extends it with `handle` and optional `log`.
 */
export interface ChannelRequestSchema<
  Req extends TSchema = TSchema,
  Res extends TSchema = TSchema,
> {
  readonly requestSchema: Req;
  readonly responseSchema: Res;
  readonly log?: ChannelRequestLogOptions<Static<Req>, Static<Res>>;
}

/**
 * Schema-only event descriptor — shared base. Identical shape on both sides.
 */
export interface ChannelEventSchema<Event extends TSchema = TSchema> {
  readonly event: Event;
  readonly log?: ChannelEventLogOptions<Static<Event>>;
}

/** Backend request contribution = schema + handler. */
export interface ChannelRequestContribution<
  Req extends TSchema = TSchema,
  Res extends TSchema = TSchema,
> extends ChannelRequestSchema<Req, Res> {
  readonly handle: (req: unknown) => unknown;
  readonly log?: ChannelRequestLogOptions<unknown, unknown>;
}

/** Backend event contribution = schema (same as frontend). */
export type ChannelEventContribution<Event extends TSchema = TSchema> =
  ChannelEventSchema<Event>;

export interface ChannelContribution {
  /** The owning channel id, carried from the contract for registration checks. */
  readonly feature: string;
  readonly requests: Record<string, ChannelRequestContribution>;
  readonly events: Record<string, ChannelEventContribution>;
}

/**
 * Frontend channel contract — schema-only view of a backend contribution.
 * Features export an object of this shape in `shared/`; both the backend
 * (via {@link withHandlers}) and the frontend (via `createChannelClient`)
 * consume the same object.
 *
 * `feature` is the owning channel id, stated once where the contract is
 * defined: clients derive canonical ids from it, and the substrate checks it
 * at every binding site (backend registration, publisher minting) so a
 * contract can't silently register or publish under the wrong namespace.
 */
export interface ChannelContract {
  readonly feature: string;
  readonly requests: Record<string, ChannelRequestSchema>;
  readonly events: Record<string, ChannelEventSchema>;
}

/**
 * Per-request handler entry — maps each request name in the contract to its
 * backend `handle` function and optional `log` config. Used by
 * {@link withHandlers}; the mapped type enforces that every request declared
 * in the contract has a matching handler.
 */
export type ChannelHandlers<C extends ChannelContract> = {
  readonly [K in keyof C["requests"] & string]: {
    readonly handle: (
      req: Static<C["requests"][K]["requestSchema"]>,
    ) =>
      | Static<C["requests"][K]["responseSchema"]>
      | Promise<Static<C["requests"][K]["responseSchema"]>>;
    readonly log?: ChannelRequestLogOptions<
      Static<C["requests"][K]["requestSchema"]>,
      Static<C["requests"][K]["responseSchema"]>
    >;
  };
};

/**
 * Merges a schema-only {@link ChannelContract} with backend handlers to
 * produce a {@link ChannelContribution}. Every request in the contract must
 * have a matching handler — if a request is added to the contract without a
 * handler, TypeScript errors at the call site.
 */
export function withHandlers<const C extends ChannelContract>(
  contract: C,
  handlers: ChannelHandlers<C>,
): ChannelContribution {
  // Per-name request/handler pairing is enforced at the call site by
  // ChannelHandlers<C>; the walk below only needs the erased shape.
  const entries = handlers as Record<
    string,
    {
      readonly handle: (req: unknown) => unknown;
      readonly log?: ChannelRequestLogOptions<unknown, unknown>;
    }
  >;
  const requests = {} as Record<string, ChannelRequestContribution>;
  for (const [name, schema] of Object.entries(contract.requests)) {
    const entry = entries[name];
    requests[name] = {
      requestSchema: schema.requestSchema,
      responseSchema: schema.responseSchema,
      handle: entry.handle,
      ...(schema.log || entry.log
        ? { log: { ...schema.log, ...entry.log } }
        : {}),
    };
  }
  return {
    feature: contract.feature,
    requests,
    events: contract.events,
  };
}

/**
 * Typed backend event publisher — the dual of the frontend {@link EventClient}.
 * Derived from a {@link ChannelContract}, each declared event becomes a typed
 * method whose argument is validated against the event schema at compile time.
 */
export type FeatureEventPublisher<C extends ChannelContract> = {
  [K in keyof C["events"] & string]: (
    event: Static<C["events"][K]["event"]>,
  ) => void;
};

/**
 * The channel capability injected into feature contexts (the channel
 * counterpart of `DocumentStoreFactory`). The cockpit closes over the
 * feature id, so the only way a feature obtains publish capability is by
 * presenting a contract — there is no untyped publish surface.
 */
export interface FeatureEventPublisherFactory {
  createPublisher<const C extends ChannelContract>(
    contract: C,
  ): FeatureEventPublisher<C>;
}

/**
 * Binds a contract's declared events onto a raw name/payload publish function,
 * producing a typed {@link FeatureEventPublisher}. The publish function is the
 * feature-scoped seam the cockpit supplies (it canonicalizes names); it stays
 * a bare function type rather than a named abstraction.
 */
export function createFeatureEventPublisher<const C extends ChannelContract>(
  publish: (
    name: string,
    payload: unknown,
    log?: ChannelEventLogOptions<unknown>,
  ) => void,
  contract: C,
): FeatureEventPublisher<C> {
  const events = {} as Record<string, (event: unknown) => void>;
  for (const [name, descriptor] of Object.entries(contract.events)) {
    events[name] = (event: unknown) => {
      publish(name, event, descriptor.log);
    };
  }
  return events as FeatureEventPublisher<C>;
}
