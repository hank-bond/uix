import type {
  ChannelContribution,
  ChannelEventContribution,
  ChannelRegistration,
  ChannelRequestContribution,
} from "@uix/api/channels";
import { featureChannelId } from "@uix/api/channels";
import type { TSchema } from "typebox";

export type ChannelRequestContract<
  Name extends string,
  Req extends TSchema,
  Res extends TSchema,
> = ChannelRequestContribution<Req, Res> & {
  readonly name: Name;
  readonly contributionId: string;
  readonly canonicalId: string;
};

export type ChannelEventContract<
  Name extends string,
  Event extends TSchema,
> = ChannelEventContribution<Event> & {
  readonly name: Name;
  readonly contributionId: string;
  readonly canonicalId: string;
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
    const id = featureChannelId(featureId, name);
    Object.assign(requests, {
      [name]: { ...request, name, contributionId: id, canonicalId: id },
    });
  }

  for (const [name, event] of Object.entries(contribution.events)) {
    assertUniqueChannelName(featureId, seen, name);
    const id = featureChannelId(featureId, name);
    Object.assign(events, {
      [name]: { ...event, name, contributionId: id, canonicalId: id },
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
