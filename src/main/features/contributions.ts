// feature contribution registration.
//
// The feature contract types (FeatureDefinition, FeatureContributions,
// FeatureContext, etc.) live behind @uix/api. This module owns the runtime
// registration functions and the per-facet registry shape
// (FeatureContributionRegistries).

import type { AgentContextRegistry } from "../agent-context/registry";
import { registerAgentContextContributions } from "../agent-context/registry";
import type { AgentToolRegistry } from "../agent-tools/registry";
import { registerAgentToolContributions } from "../agent-tools/registry";
import type { ChannelRegistry } from "../channels/registry";
import { registerChannelContributions } from "../channels/registry";
import { DisposableBag } from "../lifecycle";
import type {
  ResourceRegistry,
  ResourceSchemeRegistrar,
} from "../resources/registry";
import {
  registerResourceContributions,
  registerResourceProtocol,
} from "../resources/registry";
import type { TurnStateRegistry } from "../turn-state/registry";
import { registerTurnStateContributions } from "../turn-state/registry";

import type { FeatureDefinition, FeatureContributions } from "@uix/api/feature";

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
