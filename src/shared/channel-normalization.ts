// typed channel contributions.
//
// This is a narrow substrate facet for request/response channels and backend →
// workspace event publishing. Features declare the channels they handle; the
// substrate owns registration through the current transport adapter. Today that
// adapter is Electron IPC, but the contribution model is intentionally
// transport-neutral.

import type {
  ChannelContribution,
  ChannelEventContribution,
  ChannelLogOptions,
  ChannelRequestContribution,
} from "@uix/api/channels";
import type { TSchema } from "typebox";

import { toContributionId, type ContributionId } from "./contribution-id";

/**
 * Canonical channel id: the transport address. The format drops the facet
 * segment because within the transport the channel kind is implicit:
 * `${featureId}.${name}` (e.g. `canvas.writeback`).
 */
const ChannelCanonicalIdBrand: unique symbol = Symbol("ChannelCanonicalId");

export type ChannelCanonicalId = string & {
  readonly [ChannelCanonicalIdBrand]: true;
};

/**
 * Builds the transport address for a channel: `${featureId}.${name}`.
 * Validates each segment; a failure is an app bug.
 */
export function toChannelCanonicalId(
  featureId: string,
  name: string,
): ChannelCanonicalId {
  assertChannelToken("feature id", featureId);
  assertChannelToken("channel name", name);
  return `${featureId}.${name}` as ChannelCanonicalId;
}

export type ChannelRequestContract<
  Name extends string,
  Req extends TSchema,
  Res extends TSchema,
> = ChannelRequestContribution<Req, Res> & {
  readonly name: Name;
  readonly contributionId: ContributionId;
  readonly canonicalId: ChannelCanonicalId;
};

export type ChannelEventContract<
  Name extends string,
  Event extends TSchema,
> = ChannelEventContribution<Event> & {
  readonly name: Name;
  readonly contributionId: ContributionId;
  readonly canonicalId: ChannelCanonicalId;
};

export type ChannelContract<Contribution extends ChannelContribution> = {
  readonly featureId: string;
  readonly requests: {
    readonly [Name in keyof Contribution["requests"] &
      string]: Contribution["requests"][Name] extends ChannelRequestContribution<
      infer Req,
      infer Res
    >
      ? ChannelRequestContract<Name, Req, Res>
      : never;
  };
  readonly events: {
    readonly [Name in keyof Contribution["events"] &
      string]: Contribution["events"][Name] extends ChannelEventContribution<
      infer Event
    >
      ? ChannelEventContract<Name, Event>
      : never;
  };
};

export type ChannelRegistration<Req = unknown, Res = unknown> = {
  contributionId: ContributionId;
  canonicalId: ChannelCanonicalId;
  request: TSchema;
  response: TSchema;
  handle: (req: Req) => Res | Promise<Res>;
  log?: ChannelLogOptions<Res>;
};

export function normalizeChannelContribution<
  const Contribution extends ChannelContribution,
>(
  featureId: string,
  contribution: Contribution,
): ChannelContract<Contribution> {
  const seen = new Set<string>();
  const requests = {} as ChannelContract<Contribution>["requests"];
  const events = {} as ChannelContract<Contribution>["events"];

  for (const [name, request] of Object.entries(contribution.requests)) {
    assertUniqueChannelName(featureId, seen, name);
    const id = channelContributionIds(featureId, name);
    Object.assign(requests, {
      [name]: { ...request, name, ...id },
    });
  }

  for (const [name, event] of Object.entries(contribution.events)) {
    assertUniqueChannelName(featureId, seen, name);
    const id = channelContributionIds(featureId, name);
    Object.assign(events, {
      [name]: { ...event, name, ...id },
    });
  }

  return { featureId, requests, events };
}

export function channelRequestRegistrations(
  contract: ChannelContract<ChannelContribution>,
): readonly ChannelRegistration[] {
  return Object.values(contract.requests).map((request) => {
    return {
      contributionId: request.contributionId,
      canonicalId: request.canonicalId,
      request: request.request,
      response: request.response,
      handle: request.handle,
      log: request.log,
    };
  });
}

function channelContributionIds(
  featureId: string,
  name: string,
): {
  contributionId: ContributionId;
  canonicalId: ChannelCanonicalId;
} {
  return {
    contributionId: toContributionId(featureId, "channel", name),
    canonicalId: toChannelCanonicalId(featureId, name),
  };
}

function assertUniqueChannelName(
  featureId: string,
  seen: Set<string>,
  name: string,
): void {
  if (seen.has(name)) {
    throw new Error(`Duplicate channel name for feature ${featureId}: ${name}`);
  }
  seen.add(name);
}

function assertChannelToken(label: string, token: string): void {
  const channelTokenPattern = /^[a-z][a-z0-9_]*$/;
  if (!channelTokenPattern.test(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected ${channelTokenPattern}.`,
    );
  }
}
