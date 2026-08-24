// Registers one Workspace or Agent factory result as one rollback-safe unit.

import type {
  AgentFeatureContributions,
  AgentFeatureInstance,
  WorkspaceFeatureContributions,
  WorkspaceFeatureInstance,
} from "@uix/api/feature";

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
import type {
  AgentChannelHandlerRegistry,
  AgentChannelInvoker,
  ChannelRegistry,
} from "../channel-registry";
import {
  registerAgentChannelContracts,
  registerAgentChannelHandlers,
  registerChannelContributions,
} from "../channel-registry";
import { type AsyncDisposableBag, DisposableBag } from "../lifecycle";
import type { ResourceRegistry } from "../resource-registry";
import { registerResourceContributions } from "../resource-registry";
import type { TurnStateRegistry } from "../turn-state";
import { registerTurnStateContributions } from "../turn-state";

export interface WorkspaceFeatureRegistries {
  resources: ResourceRegistry;
  channels: ChannelRegistry;
  invokeAgentChannel: AgentChannelInvoker;
  surfaces: SurfaceRegistry;
}

export interface AgentFeatureRegistries {
  channels: AgentChannelHandlerRegistry;
  agentTools: AgentToolRegistry;
  agentSystemPrompt: AgentSystemPromptRegistry;
  agentSkills: AgentSkillRegistry;
  turnState: TurnStateRegistry;
  agentContext: AgentContextRegistry;
}

/** Where the feature's definition came from, for path-relative facets. */
export interface FeatureOrigin {
  /** Directory of the feature's entry file. */
  entryDir?: string;
}

/** Add a returned contribution object's standard cleanup to its owner. */
export function addFeatureInstanceLifetime(
  bag: AsyncDisposableBag,
  instance: WorkspaceFeatureInstance | AgentFeatureInstance,
): void {
  if (Symbol.asyncDispose in instance) {
    bag.add(instance as AsyncDisposable);
  } else if (Symbol.dispose in instance) {
    bag.add(instance as Disposable);
  }
}

/** Register all Workspace facets returned by one feature factory. */
export function registerWorkspaceFeatureContributions(
  registries: WorkspaceFeatureRegistries,
  featureId: string,
  contributions: WorkspaceFeatureContributions,
  origin: FeatureOrigin = {},
): Disposable {
  const bag = new DisposableBag();
  try {
    if (contributions.resources?.length) {
      bag.add(
        registerResourceContributions(
          registries.resources,
          featureId,
          contributions.resources,
        ),
      );
    }
    if (contributions.channels?.length) {
      bag.add(
        registerChannelContributions(
          registries.channels,
          featureId,
          contributions.channels,
        ),
      );
    }
    if (contributions.agentChannelContracts?.length) {
      bag.add(
        registerAgentChannelContracts(
          registries.channels,
          featureId,
          contributions.agentChannelContracts,
          registries.invokeAgentChannel,
        ),
      );
    }
    if (contributions.surfaces?.length) {
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
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}

/** Register all Agent facets returned by one feature factory. */
export function registerAgentFeatureContributions(
  registries: AgentFeatureRegistries,
  featureId: string,
  contributions: AgentFeatureContributions,
  origin: FeatureOrigin = {},
): Disposable {
  const bag = new DisposableBag();
  try {
    if (contributions.channels?.length) {
      bag.add(
        registerAgentChannelHandlers(
          registries.channels,
          featureId,
          contributions.channels,
        ),
      );
    }
    if (contributions.agentTools?.length) {
      bag.add(
        registerAgentToolContributions(
          registries.agentTools,
          featureId,
          contributions.agentTools,
        ),
      );
    }
    if (contributions.agentToolOverrides?.length) {
      bag.add(
        registerAgentToolOverrideContributions(
          registries.agentTools,
          featureId,
          contributions.agentToolOverrides,
        ),
      );
    }
    if (contributions.agentSystemPrompt !== undefined) {
      bag.add(
        registerAgentSystemPromptContribution(
          registries.agentSystemPrompt,
          featureId,
          contributions.agentSystemPrompt,
        ),
      );
    }
    if (contributions.agentSkills?.length) {
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
    if (contributions.turnState) {
      bag.add(
        registerTurnStateContributions(
          registries.turnState,
          featureId,
          contributions.turnState,
        ),
      );
    }
    if (contributions.agentContext?.length) {
      bag.add(
        registerAgentContextContributions(
          registries.agentContext,
          featureId,
          contributions.agentContext,
        ),
      );
    }
    return bag;
  } catch (error) {
    bag[Symbol.dispose]();
    throw error;
  }
}
