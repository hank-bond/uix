import type { TSchema } from "typebox";

export interface ChannelLogOptions<Res> {
  describeResult?: (res: Res) => unknown;
}

export interface ChannelRequestContribution<
  Req extends TSchema = TSchema,
  Res extends TSchema = TSchema,
> {
  readonly requestSchema: Req;
  readonly responseSchema: Res;
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

export interface FeatureChannelPublisher {
  publish(name: string, payload: unknown): void;
}
