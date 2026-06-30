// feature contribution registration.
//
// This is intentionally not a full feature system. It centralizes the repeated
// facet-registration/lifetime pattern while canvas is being decomposed into
// explicit contribution axes.

import type {
  AgentContextContribution,
  AgentContextRegistry,
} from "../agent-context/registry";
import { registerAgentContextContributions } from "../agent-context/registry";
import type {
  AgentToolContribution,
  AgentToolRegistry,
} from "../agent-tools/registry";
import { registerAgentToolContributions } from "../agent-tools/registry";
import type { ChannelContribution } from "@uix/api/channels";
import type { ChannelRegistry } from "../channels/registry";
import { registerChannelContributions } from "../channels/registry";
import type { FeatureContext } from "./context";
import { DisposableBag } from "../lifecycle";
import type {
  ResourceContribution,
  ResourceRegistry,
  ResourceSchemeRegistrar,
} from "../resources/registry";
import {
  registerResourceContributions,
  registerResourceProtocol,
} from "../resources/registry";
import type {
  TurnStateContribution,
  TurnStateRegistry,
} from "../turn-state/registry";
import { registerTurnStateContributions } from "../turn-state/registry";

export type FeaturePreflightContributions = Record<string, never>;

export interface FeatureDefinition<
  ContributedContext extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  preflight?: FeaturePreflightContributions;
  /**
   * Feature-local context hook. Runs first, before any other contribution,
   * and is the only contribution whose execution order is guaranteed. Its
   * return value is merged onto the substrate `FeatureContext` and handed to
   * `contribute` and every facet factory.
   */
  context?: (ctx: FeatureContext) => ContributedContext;
  contribute(ctx: FeatureContext & ContributedContext): FeatureContributions;
}

export interface FeatureContributions {
  resources?: readonly ResourceContribution[];
  channels?: readonly ChannelContribution[];
  agentTools?: readonly AgentToolContribution[];
  turnState?: readonly TurnStateContribution[];
  agentContext?: readonly AgentContextContribution[];
}

export interface FeatureContributionRegistries {
  resources?: ResourceRegistry;
  channels?: ChannelRegistry;
  agentTools?: AgentToolRegistry;
  turnState?: TurnStateRegistry;
  agentContext?: AgentContextRegistry;
}

export function registerFeatureContributions(
  registries: FeatureContributionRegistries,
  featureId: string,
  contributions: FeatureContributions,
): Disposable {
  const bag = new DisposableBag();

  if (contributions.resources?.length) {
    if (!registries.resources) {
      throw new Error(
        `Feature ${featureId} contributes resources but no resource registry was provided`,
      );
    }
    bag.add(
      registerResourceContributions(
        registries.resources,
        featureId,
        contributions.resources,
      ),
    );
  }

  if (contributions.channels?.length) {
    if (!registries.channels) {
      throw new Error(
        `Feature ${featureId} contributes channels but no channel registry was provided`,
      );
    }
    bag.add(
      registerChannelContributions(
        registries.channels,
        featureId,
        contributions.channels,
      ),
    );
  }

  if (contributions.agentTools?.length) {
    if (!registries.agentTools) {
      throw new Error(
        `Feature ${featureId} contributes agent tools but no agent tool registry was provided`,
      );
    }
    bag.add(
      registerAgentToolContributions(
        registries.agentTools,
        featureId,
        contributions.agentTools,
      ),
    );
  }

  if (contributions.turnState?.length) {
    if (!registries.turnState) {
      throw new Error(
        `Feature ${featureId} contributes turn state but no turn-state registry was provided`,
      );
    }
    bag.add(
      registerTurnStateContributions(
        registries.turnState,
        featureId,
        contributions.turnState,
      ),
    );
  }

  if (contributions.agentContext?.length) {
    if (!registries.agentContext) {
      throw new Error(
        `Feature ${featureId} contributes agent context but no agent-context registry was provided`,
      );
    }
    bag.add(
      registerAgentContextContributions(
        registries.agentContext,
        featureId,
        contributions.agentContext,
      ),
    );
  }

  return bag;
}

export function registerFeaturePreflightContributions(
  _features: readonly FeatureDefinition[],
  registerResourceSchemes?: ResourceSchemeRegistrar,
): void {
  registerResourceProtocol(registerResourceSchemes);
}
