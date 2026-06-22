// UIX cockpit — typed channel contributions.
//
// This is a narrow substrate facet for request/response channels. Features
// declare the channels they handle; the substrate owns registration through
// the current transport adapter. Today that adapter is Electron IPC, but the
// contribution model is intentionally transport-neutral.

import type { HandleLogOptions } from "../ipc";
import * as ipc from "../ipc";
import { DisposableBag, disposable } from "../lifecycle";

export interface ChannelContribution<Req = unknown, Res = void> {
  id: string;
  channel: string;
  handle: (req: Req) => Res | Promise<Res>;
  log?: HandleLogOptions<Res>;
}

export type ChannelTransportHandle = (
  channel: string,
  fn: (req: unknown) => Promise<unknown>,
  logOpts?: HandleLogOptions<unknown>,
) => Disposable;

export interface ChannelRegistry {
  register<Req, Res>(contribution: ChannelContribution<Req, Res>): Disposable;
}

export function createChannelRegistry(
  handle: ChannelTransportHandle = (channel, fn, logOpts) =>
    ipc.handle<unknown, unknown>(channel, fn, logOpts),
): ChannelRegistry {
  const ids = new Set<string>();
  const channels = new Set<string>();

  return {
    register<Req, Res>(contribution: ChannelContribution<Req, Res>) {
      if (ids.has(contribution.id)) {
        throw new Error(
          `Channel contribution already registered: ${contribution.id}`,
        );
      }
      if (channels.has(contribution.channel)) {
        throw new Error(`Channel already registered: ${contribution.channel}`);
      }

      ids.add(contribution.id);
      channels.add(contribution.channel);
      const registration = handle(
        contribution.channel,
        async (req) => await contribution.handle(req as Req),
        contribution.log as HandleLogOptions<unknown> | undefined,
      );

      let disposed = false;
      return disposable(() => {
        if (disposed) return;
        disposed = true;
        registration[Symbol.dispose]();
        ids.delete(contribution.id);
        channels.delete(contribution.channel);
      });
    },
  };
}

export function registerChannelContributions(
  registry: ChannelRegistry,
  contributions: readonly ChannelContribution[],
): Disposable {
  const bag = new DisposableBag();
  for (const contribution of contributions) {
    bag.add(registry.register(contribution));
  }
  return bag;
}
