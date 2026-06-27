// feature contribution registration.
//
// This is intentionally not a full feature system. It centralizes the repeated
// facet-registration/lifetime pattern while canvas is being decomposed into
// explicit contribution axes.

import type {
  StateMessageContribution,
  StateMessageRegistry,
} from "../agent/state-messages";
import { registerStateMessageContributions } from "../agent/state-messages";
import type { AgentToolContribution, AgentToolRegistry } from "../agent/tools";
import { registerAgentToolContributions } from "../agent/tools";
import type { ChannelContribution } from "@uix/api/channels";
import type { ChannelRegistry } from "../channels/registry";
import { registerChannelContributions } from "../channels/registry";
import type { FeatureContext } from "./context";
import { DisposableBag } from "../lifecycle";
import type {
  ResourceContribution,
  ResourceRegistry,
  ResourceSchemeContribution,
  ResourceSchemeRegistrar,
} from "../resources/registry";
import {
  registerResourceContributions,
  registerResourceSchemeContributions,
} from "../resources/registry";
import type { StateContribution, StateRegistry } from "../state/registry";
import { registerStateContributions } from "../state/registry";

export interface FeaturePreflightContributions {
  resourceSchemes?: readonly ResourceSchemeContribution[];
}

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
  state?: readonly StateContribution[];
  stateMessages?: readonly StateMessageContribution[];
}

export interface FeatureContributionRegistries {
  resources?: ResourceRegistry;
  channels?: ChannelRegistry;
  agentTools?: AgentToolRegistry;
  state?: StateRegistry;
  stateMessages?: StateMessageRegistry;
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

  if (contributions.state?.length) {
    if (!registries.state) {
      throw new Error(
        `Feature ${featureId} contributes state but no state registry was provided`,
      );
    }
    bag.add(registerStateContributions(registries.state, contributions.state));
  }

  if (contributions.stateMessages?.length) {
    if (!registries.stateMessages) {
      throw new Error(
        `Feature ${featureId} contributes state messages but no state-message registry was provided`,
      );
    }
    bag.add(
      registerStateMessageContributions(
        registries.stateMessages,
        featureId,
        contributions.stateMessages,
      ),
    );
  }

  return bag;
}

export function registerFeaturePreflightContributions(
  features: readonly FeatureDefinition[],
  registerResourceSchemes?: ResourceSchemeRegistrar,
): void {
  registerResourceSchemeContributions(
    features.flatMap((feature) => feature.preflight?.resourceSchemes ?? []),
    registerResourceSchemes,
  );
}
