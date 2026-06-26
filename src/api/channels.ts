import type { TSchema } from "typebox";

export interface ChannelLogOptions<Res> {
  describeResult?: (res: Res) => unknown;
}

export interface ChannelRequestContribution<
  Req extends TSchema = TSchema,
  Res extends TSchema = TSchema,
> {
  readonly request: Req;
  readonly response: Res;
  readonly handle: (req: unknown) => unknown;
  readonly log?: ChannelLogOptions<unknown>;
}

export interface ChannelEventContribution<Event extends TSchema = TSchema> {
  readonly event: Event;
}

export interface ChannelContribution {
  readonly requests: Record<string, ChannelRequestContribution>;
  readonly events: Record<string, ChannelEventContribution>;
}

export interface ChannelRegistration<Req = unknown, Res = unknown> {
  contributionId: string;
  canonicalId?: string;
  request: TSchema;
  response: TSchema;
  handle: (req: Req) => Res | Promise<Res>;
  log?: ChannelLogOptions<Res>;
}

export interface FeatureChannelPublisher {
  publish(name: string, payload: unknown): void;
}

export function featureChannelId(featureId: string, name: string): string {
  assertWordChars("feature id", featureId);
  assertWordChars("channel name", name);
  return `${featureId}.channel.${name}`;
}

function assertWordChars(label: string, token: string): void {
  const contributionTokenPattern = /^[a-z][a-z0-9_]*$/;
  if (!contributionTokenPattern.test(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected ${contributionTokenPattern}.`,
    );
  }
}
