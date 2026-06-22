// UIX cockpit — feature contribution registration.
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
import { DisposableBag } from "../lifecycle";
import type { StateContribution, StateRegistry } from "../state/registry";
import { registerStateContributions } from "../state/registry";

export interface FeatureContributions {
  id: string;
  agentTools?: readonly AgentToolContribution[];
  state?: readonly StateContribution[];
  stateMessages?: readonly StateMessageContribution[];
}

export interface FeatureContributionRegistries {
  agentTools?: AgentToolRegistry;
  state?: StateRegistry;
  stateMessages?: StateMessageRegistry;
}

export function registerFeatureContributions(
  registries: FeatureContributionRegistries,
  feature: FeatureContributions,
): Disposable {
  const bag = new DisposableBag();

  if (feature.agentTools?.length) {
    if (!registries.agentTools) {
      throw new Error(
        `Feature ${feature.id} contributes agent tools but no agent tool registry was provided`,
      );
    }
    bag.add(
      registerAgentToolContributions(registries.agentTools, feature.agentTools),
    );
  }

  if (feature.state?.length) {
    if (!registries.state) {
      throw new Error(
        `Feature ${feature.id} contributes state but no state registry was provided`,
      );
    }
    bag.add(registerStateContributions(registries.state, feature.state));
  }

  if (feature.stateMessages?.length) {
    if (!registries.stateMessages) {
      throw new Error(
        `Feature ${feature.id} contributes state messages but no state-message registry was provided`,
      );
    }
    bag.add(
      registerStateMessageContributions(
        registries.stateMessages,
        feature.stateMessages,
      ),
    );
  }

  return bag;
}
