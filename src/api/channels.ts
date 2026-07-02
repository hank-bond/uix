import type { Static, TSchema } from "typebox";

export interface ChannelLogOptions<Res> {
  describeResult?: (res: Res) => unknown;
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
}

/**
 * Schema-only event descriptor — shared base. Identical shape on both sides.
 */
export interface ChannelEventSchema<Event extends TSchema = TSchema> {
  readonly event: Event;
}

/** Backend request contribution = schema + handler. */
export interface ChannelRequestContribution<
  Req extends TSchema = TSchema,
  Res extends TSchema = TSchema,
> extends ChannelRequestSchema<Req, Res> {
  readonly handle: (req: unknown) => unknown;
  readonly log?: ChannelLogOptions<unknown>;
}

/** Backend event contribution = schema (same as frontend). */
export type ChannelEventContribution<Event extends TSchema = TSchema> =
  ChannelEventSchema<Event>;

export interface ChannelContribution {
  readonly requests: Record<string, ChannelRequestContribution>;
  readonly events: Record<string, ChannelEventContribution>;
}

/**
 * Frontend channel contract — schema-only view of a backend contribution.
 * Features export an object of this shape in `shared/`; both the backend
 * (via {@link withHandlers}) and the frontend (via `createChannelClient`)
 * consume the same object.
 */
export interface ChannelContract {
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
    readonly log?: ChannelLogOptions<
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
      readonly log?: ChannelLogOptions<unknown>;
    }
  >;
  const requests = {} as Record<string, ChannelRequestContribution>;
  for (const [name, schema] of Object.entries(contract.requests)) {
    const entry = entries[name];
    requests[name] = {
      requestSchema: schema.requestSchema,
      responseSchema: schema.responseSchema,
      handle: entry.handle,
      ...(entry.log ? { log: entry.log } : {}),
    };
  }
  return {
    requests,
    events: contract.events,
  };
}

export interface FeatureChannelPublisher {
  publish(name: string, payload: unknown): void;
}
