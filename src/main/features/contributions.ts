// Registers all of one feature's capabilities together and rolls them all back if any registration fails.

import type { FeatureContributions, FeatureDefinition } from "@uix/api/feature";

import type { SurfaceRegistry } from "./surfaces";
import { registerSurfaceContributions } from "./surfaces";
import type { AgentContextRegistry } from "../agent-context/registry";
import { registerAgentContextContributions } from "../agent-context/registry";
import type { AgentSkillRegistry } from "../agent-skill-registry";
import { registerAgentSkillContributions } from "../agent-skill-registry";
import type { AgentSystemPromptRegistry } from "../agent-system-prompt-registry";
import { registerAgentSystemPromptContribution } from "../agent-system-prompt-registry";
import type { AgentToolRegistry } from "../agent-tools/registry";
import {
  registerAgentToolContributions,
  registerAgentToolOverrideContributions,
} from "../agent-tools/registry";
import type { ChannelRegistry } from "../channel-registry";
import { registerChannelContributions } from "../channel-registry";
import { DisposableBag } from "../lifecycle";
import type {
  ResourceRegistry,
  ResourceSchemeRegistrar,
} from "../resource-registry";
import {
  registerResourceContributions,
  registerResourceProtocol,
} from "../resource-registry";
import type { TurnStateRegistry } from "../turn-state";
import { registerTurnStateContributions } from "../turn-state";

export interface FeatureContributionRegistries {
  resources?: ResourceRegistry;
  channels?: ChannelRegistry;
  agentTools?: AgentToolRegistry;
  agentSystemPrompt?: AgentSystemPromptRegistry;
  agentSkills?: AgentSkillRegistry;
  turnState?: TurnStateRegistry;
  agentContext?: AgentContextRegistry;
  surfaces?: SurfaceRegistry;
}

/** Where the feature's definition came from, for path-relative facets. */
export interface FeatureOrigin {
  /**
   * Directory of the feature's entry file; surface entry refs resolve
   * against it. Absent for compiled-in definitions, which therefore cannot
   * contribute surfaces.
   */
  entryDir?: string;
}

/**
 * Register every contributed facet under one feature lifetime.
 *
 * The caller owns the returned lifetime. If any facet fails, this operation
 * disposes all earlier facet registrations before it rethrows.
 */
export function registerFeatureContributions(
  registries: FeatureContributionRegistries,
  featureId: string,
  contributions: FeatureContributions,
  origin: FeatureOrigin = {},
): Disposable {
  const bag = new DisposableBag();

  try {
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

    if (contributions.agentToolOverrides?.length) {
      if (!registries.agentTools) {
        throw new Error(
          `Feature ${featureId} contributes agent tool overrides but no agent tool registry was provided`,
        );
      }
      bag.add(
        registerAgentToolOverrideContributions(
          registries.agentTools,
          featureId,
          contributions.agentToolOverrides,
        ),
      );
    }

    if (contributions.agentSystemPrompt !== undefined) {
      if (!registries.agentSystemPrompt) {
        throw new Error(
          `Feature ${featureId} contributes an agent system prompt but no agent-system-prompt registry was provided`,
        );
      }
      bag.add(
        registerAgentSystemPromptContribution(
          registries.agentSystemPrompt,
          featureId,
          contributions.agentSystemPrompt,
        ),
      );
    }

    if (contributions.agentSkills?.length) {
      if (!registries.agentSkills) {
        throw new Error(
          `Feature ${featureId} contributes agent skills but no agent-skills registry was provided`,
        );
      }
      if (!origin.entryDir) {
        throw new Error(
          `Feature ${featureId} contributes agent skills but was activated without an entry directory to resolve them against`,
        );
      }
      bag.add(
        registerAgentSkillContributions(
          registries.agentSkills,
          featureId,
          contributions.agentSkills,
          origin.entryDir,
        ),
      );
    }

    if (
      contributions.turnState &&
      Object.keys(contributions.turnState).length > 0
    ) {
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

    if (contributions.surfaces?.length) {
      if (!registries.surfaces) {
        throw new Error(
          `Feature ${featureId} contributes surfaces but no surface registry was provided`,
        );
      }
      if (!origin.entryDir) {
        throw new Error(
          `Feature ${featureId} contributes surfaces but was activated without an entry directory to resolve them against`,
        );
      }
      bag.add(
        registerSurfaceContributions(
          registries.surfaces,
          featureId,
          contributions.surfaces,
          origin.entryDir,
        ),
      );
    }

    return bag;
  } catch (err) {
    bag[Symbol.dispose]();
    throw err;
  }
}

/** Register process-wide feature protocols before Electron becomes ready. */
export function registerFeaturePreflightContributions(
  _features: readonly FeatureDefinition[],
  registerResourceSchemes?: ResourceSchemeRegistrar,
): void {
  registerResourceProtocol(registerResourceSchemes);
}
