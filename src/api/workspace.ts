import type { Static } from "typebox";
import { Value } from "typebox/value";
import type { ReactNode } from "react";
import { toChannelCanonicalId } from "#shared/channel-normalization";
import type { ChannelContract } from "./channels";

export interface WorkspaceClient {
  readonly workspaceId: string;
  readonly request: <Req, Res = void>(name: string, req: Req) => Promise<Res>;
  readonly subscribe: <Event>(
    name: string,
    handler: (event: Event) => void,
  ) => () => void;
}

type RequestClient<C extends ChannelContract> = {
  [K in keyof C["requests"] & string]: (
    req: Static<C["requests"][K]["requestSchema"]>,
  ) => Promise<Static<C["requests"][K]["responseSchema"]>>;
};

type EventClient<C extends ChannelContract> = {
  [K in keyof C["events"] & string]: (
    handler: (event: Static<C["events"][K]["event"]>) => void,
  ) => () => void;
};

export interface ChannelClient<C extends ChannelContract> {
  requests: RequestClient<C>;
  subscriptions: EventClient<C>;
}

export function createChannelClient<const C extends ChannelContract>(
  workspace: WorkspaceClient,
  featureId: string,
  contract: C,
): ChannelClient<C> {
  const requests = {} as Record<string, unknown>;
  for (const name of Object.keys(contract.requests)) {
    const canonicalId = toChannelCanonicalId(featureId, name);
    requests[name] = (payload: unknown) =>
      workspace.request(canonicalId, payload);
  }

  const subscriptions = {} as Record<string, unknown>;
  for (const [name, evt] of Object.entries(contract.events)) {
    const canonicalId = toChannelCanonicalId(featureId, name);
    // Events cross the transport unvalidated (the registry only parses
    // request/response payloads), so the schema check lives here.
    subscriptions[name] = (handler: (payload: unknown) => void) =>
      workspace.subscribe(canonicalId, (raw: unknown) =>
        handler(Value.Parse(evt.event, raw)),
      );
  }

  return { requests, subscriptions } as ChannelClient<C>;
}

/**
 * Opaque surface contribution — the layout array is heterogeneous, so the
 * contract's type parameter is erased here. The typed surface is created via
 * {@link defineSurface}, which captures the generic at definition time and
 * pushes the unavoidable cast into the substrate.
 */
export interface SurfaceContribution {
  readonly name: string;
  readonly featureId?: string;
  readonly contract?: ChannelContract;
  readonly render: (client: unknown) => ReactNode;
}

/**
 * Defines a surface that receives a typed channel client. The `render`
 * function's `client` parameter is fully typed from the contract — features
 * never cast. The single unavoidable cast (erasing the generic for the
 * heterogeneous layout array) lives here in the substrate.
 */
export function defineSurface<const C extends ChannelContract>(
  name: string,
  featureId: string,
  contract: C,
  render: (client: ChannelClient<C>) => ReactNode,
): SurfaceContribution {
  return {
    name,
    featureId,
    contract,
    render: render as (client: unknown) => ReactNode,
  };
}
