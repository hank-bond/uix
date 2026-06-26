// typed channel contributions.
//
// This is a narrow substrate facet for request/response channels and backend →
// workspace event publishing. Features declare the channels they handle; the
// substrate owns registration through the current transport adapter. Today that
// adapter is Electron IPC, but the contribution model is intentionally
// transport-neutral.

import type {
  ChannelContribution,
  ChannelRegistration,
  FeatureChannelPublisher,
} from "@uix/api/channels";
import { featureChannelId } from "@uix/api/channels";
import {
  channelRequestRegistrations,
  normalizeChannelContribution,
} from "#shared/channel-normalization";
import { Value } from "typebox/value";

import type { HandleLogOptions } from "../ipc";
import * as ipc from "../ipc";
import { DisposableBag, disposable } from "../lifecycle";

export type ChannelTransportHandle = (
  canonicalId: string,
  fn: (req: unknown) => Promise<unknown>,
  logOpts?: HandleLogOptions<unknown>,
) => Disposable;

export type ChannelTransportPublish = (
  canonicalId: string,
  payload: unknown,
) => void;

export interface ChannelRegistry {
  publish(canonicalId: string, payload: unknown): void;
  register<Req, Res>(registration: ChannelRegistration<Req, Res>): Disposable;
}

export interface ChannelRegistryOptions {
  handle?: ChannelTransportHandle;
  publish?: ChannelTransportPublish;
}

export function createChannelRegistry(
  opts: ChannelRegistryOptions = {},
): ChannelRegistry {
  const handle =
    opts.handle ??
    ((canonicalId, fn, logOpts) =>
      ipc.handle<unknown, unknown>(canonicalId, fn, logOpts));
  const publish = opts.publish ?? (() => undefined);
  const contributionIds = new Set<string>();
  const canonicalIds = new Set<string>();

  return {
    publish,
    register<Req, Res>(channelRegistration: ChannelRegistration<Req, Res>) {
      const canonicalId =
        channelRegistration.canonicalId ?? channelRegistration.contributionId;
      if (contributionIds.has(channelRegistration.contributionId)) {
        throw new Error(
          `Channel contribution already registered: ${channelRegistration.contributionId}`,
        );
      }
      if (canonicalIds.has(canonicalId)) {
        throw new Error(`Channel already registered: ${canonicalId}`);
      }

      contributionIds.add(channelRegistration.contributionId);
      canonicalIds.add(canonicalId);
      const transportRegistration = handle(
        canonicalId,
        async (rawReq) => {
          const req = Value.Parse(channelRegistration.request, rawReq);
          const res = await channelRegistration.handle(req as Req);
          return Value.Parse(channelRegistration.response, res);
        },
        channelRegistration.log as HandleLogOptions<unknown> | undefined,
      );

      let disposed = false;
      return disposable(() => {
        if (disposed) return;
        disposed = true;
        transportRegistration[Symbol.dispose]();
        contributionIds.delete(channelRegistration.contributionId);
        canonicalIds.delete(canonicalId);
      });
    },
  };
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

export function createFeatureChannelPublisher(
  featureId: string,
  publisher: Pick<ChannelRegistry, "publish">,
): FeatureChannelPublisher {
  return {
    publish(name: string, payload: unknown) {
      publisher.publish(featureChannelId(featureId, name), payload);
    },
  };
}
