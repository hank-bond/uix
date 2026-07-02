// feature contribution contract.
//
// FeatureDefinition is the shape a discovered or bundled feature exports: an
// id, an optional context hook, and a contribute function that returns the
// feature's facet contributions. Bundled and discovered features are
// indistinguishable here — the substrate registers both through the same path.
//
// FeatureContext is the service bag injected by the cockpit into every feature
// at activation time. Features access external state only through this object
// and the typed contribution schemas — never by importing cockpit internals.

import type {
  ChannelContribution,
  FeatureEventPublisherFactory,
} from "./channels";
import type { AgentToolContribution } from "./agent-tools";
import type { TurnStateContribution } from "./turn-state";
import type { AgentContextContribution } from "./agent-context";
import type { ResourceContribution } from "./resources";
import type { DocumentStoreFactory } from "./documents";

export type { ChannelContribution } from "./channels";
export type { AgentToolContribution } from "./agent-tools";
export type { TurnStateContribution } from "./turn-state";
export type { AgentContextContribution } from "./agent-context";
export type { ResourceContribution } from "./resources";
export type { DocumentStoreFactory } from "./documents";

export type FeatureContext = {
  documents: DocumentStoreFactory;
  channels: FeatureEventPublisherFactory;
};

export type FeaturePreflightContributions = Record<string, never>;

export interface FeatureContributions {
  resources?: readonly ResourceContribution[];
  channels?: readonly ChannelContribution[];
  agentTools?: readonly AgentToolContribution[];
  turnState?: readonly TurnStateContribution[];
  agentContext?: readonly AgentContextContribution[];
}

export interface FeatureDefinition<
  ContributedContext extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  preflight?: FeaturePreflightContributions;
  /**
   * Feature-local context hook. Runs first, before any other contribution,
   * and is the only contribution whose execution order is guaranteed. Its
   * return value is merged onto the substrate FeatureContext and handed to
   * `contribute` and every facet factory.
   */
  context?: (ctx: FeatureContext) => ContributedContext;
  contribute(ctx: FeatureContext & ContributedContext): FeatureContributions;
}
