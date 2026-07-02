// typed channel contributions.
//
// This is a narrow substrate facet for request/response channels and backend →
// workspace event publishing. Features declare the channels they handle; the
// substrate owns registration through the current transport adapter. Today that
// adapter is Electron IPC, but the contribution model is intentionally
// transport-neutral.

import type {
  ChannelContribution,
  FeatureEventPublisherFactory,
} from "@uix/api/channels";
import { createFeatureEventPublisher } from "@uix/api/channels";
import {
  toChannelCanonicalId,
  type ChannelCanonicalId,
  type ChannelRegistration,
} from "#shared/channel-normalization";
import {
  channelRequestRegistrations,
  normalizeChannelContribution,
} from "#shared/channel-normalization";
import { Value } from "typebox/value";

import type { HandleLogOptions } from "../ipc";
import { DisposableBag, disposable } from "../lifecycle";

export type ChannelTransportHandle = (
  canonicalId: ChannelCanonicalId,
  fn: (req: unknown) => Promise<unknown>,
  logOpts?: HandleLogOptions<unknown>,
) => Disposable;

export type ChannelTransportPublish = (
  canonicalId: ChannelCanonicalId,
  payload: unknown,
) => void;

export interface ChannelRegistryOptions {
  transportHandle: ChannelTransportHandle;
  publish?: ChannelTransportPublish;
}

export class ChannelRegistry {
  readonly #transportHandle: ChannelTransportHandle;
  readonly #publish: ChannelTransportPublish;
  readonly #canonicalIds = new Set<ChannelCanonicalId>();

  constructor(opts: ChannelRegistryOptions) {
    this.#transportHandle = opts.transportHandle;
    this.#publish = opts.publish ?? (() => undefined);
  }

  publish(canonicalId: ChannelCanonicalId, payload: unknown): void {
    this.#publish(canonicalId, payload);
  }

  register<Req, Res>(
    channelRegistration: ChannelRegistration<Req, Res>,
  ): Disposable {
    const { canonicalId } = channelRegistration;
    if (this.#canonicalIds.has(canonicalId)) {
      throw new Error(`Channel already registered: ${canonicalId}`);
    }

    this.#canonicalIds.add(canonicalId);
    const transportRegistration = this.#transportHandle(
      canonicalId,
      async (rawReq) => {
        const req = Value.Parse(channelRegistration.requestSchema, rawReq);
        const res = await channelRegistration.handle(req as Req);
        return Value.Parse(channelRegistration.responseSchema, res);
      },
      channelRegistration.log as HandleLogOptions<unknown> | undefined,
    );

    let disposed = false;
    return disposable(() => {
      if (disposed) return;
      disposed = true;
      transportRegistration[Symbol.dispose]();
      this.#canonicalIds.delete(canonicalId);
    });
  }
}

export function registerChannelContributions(
  registry: ChannelRegistry,
  featureId: string,
  contributions: readonly ChannelContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    const contract = normalizeChannelContribution(featureId, contribution);
    for (const registration of channelRequestRegistrations(contract)) {
      bag.add(registry.register(registration));
    }
  }
  return bag;
}

/**
 * The `channels` capability handed to a feature's context. The feature id and
 * the registry are closed over here, so a publisher can only be minted for
 * the feature's own namespace and only by presenting a contract — there is no
 * untyped publish surface and no way to emit onto canonical ids nobody
 * declared.
 */
export function createFeatureEventPublisherFactory(
  featureId: string,
  publisher: Pick<ChannelRegistry, "publish">,
): FeatureEventPublisherFactory {
  return {
    createPublisher: (contract) =>
      createFeatureEventPublisher(
        (name, payload) =>
          publisher.publish(toChannelCanonicalId(featureId, name), payload),
        contract,
      ),
  };
}
