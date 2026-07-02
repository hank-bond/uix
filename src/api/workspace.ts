import type { Static } from "typebox";
import { Value } from "typebox/value";
import type { ReactNode } from "react";
import { toChannelCanonicalId } from "#shared/channel-normalization";
import { isIdToken } from "#shared/contribution-id";
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
  contract: C,
): ChannelClient<C> {
  const requests = {} as Record<string, unknown>;
  for (const name of Object.keys(contract.requests)) {
    const canonicalId = toChannelCanonicalId(contract.feature, name);
    requests[name] = (payload: unknown) =>
      workspace.request(canonicalId, payload);
  }

  const subscriptions = {} as Record<string, unknown>;
  for (const [name, evt] of Object.entries(contract.events)) {
    const canonicalId = toChannelCanonicalId(contract.feature, name);
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
 * Opaque surface contribution — the workspace's surface list is
 * heterogeneous, so the contract's type parameter is erased here. The typed
 * surface is created via {@link defineSurface}, which captures the generic at
 * definition time and pushes the unavoidable cast into the substrate.
 */
export interface SurfaceContribution {
  readonly name: string;
  readonly contract?: ChannelContract;
  /** Adopted into the document while the surface is mounted. */
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (client: unknown) => ReactNode;
}

/** A surface bound to a channel contract; `render` gets the typed client. */
export interface SurfaceDefinition<C extends ChannelContract> {
  readonly name: string;
  readonly contract: C;
  readonly styles?: readonly CSSStyleSheet[];
  readonly render: (client: ChannelClient<C>) => ReactNode;
}

/** A surface with no channel binding — pure presentation or local state. */
export interface ContractlessSurfaceDefinition extends Omit<
  SurfaceDefinition<ChannelContract>,
  "contract" | "render"
> {
  readonly render: () => ReactNode;
}

/**
 * Defines a surface. With a `contract`, `render`'s `client` parameter is
 * fully typed from it — features never cast; the client is minted by the
 * substrate mount under the contract's own channel id. A surface module's
 * **default export** must be this result — that is how the runtime loader
 * finds the surface. The single unavoidable cast (erasing the generic for
 * the heterogeneous surface list) lives here in the substrate.
 */
export function defineSurface<const C extends ChannelContract>(
  surface: SurfaceDefinition<C>,
): SurfaceContribution;
export function defineSurface(
  surface: ContractlessSurfaceDefinition,
): SurfaceContribution;
export function defineSurface(
  surface: Omit<SurfaceContribution, "render"> & {
    readonly render: (client: never) => ReactNode;
  },
): SurfaceContribution {
  if (!isIdToken(surface.name)) {
    throw new Error(
      `Invalid surface name: ${surface.name}. Expected a lowercase id token.`,
    );
  }
  return {
    name: surface.name,
    ...(surface.contract ? { contract: surface.contract } : {}),
    ...(surface.styles ? { styles: surface.styles } : {}),
    render: surface.render as (client: unknown) => ReactNode,
  };
}
