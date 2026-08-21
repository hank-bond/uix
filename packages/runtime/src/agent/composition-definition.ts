// Defines one immutable, reusable Agent composition recipe from admitted feature facets.

import type { AgentContextContribution } from "@uix/api/agent-context";
import type { AgentSkillContribution } from "@uix/api/agent-skills";
import type { AgentSystemPromptContribution } from "@uix/api/agent-system-prompt";
import type { AgentToolContribution } from "@uix/api/agent-tools";
import type { ChannelContract, ChannelHandlers } from "@uix/api/channels";
import type { AgentFeatureStateBuilder } from "@uix/api/feature-state";
import type { TurnStateContributions } from "@uix/api/turn-state";

type ErasedAgentStateFactory = (
  state: AgentFeatureStateBuilder<object>,
) => AgentFeatureStateBuilder<object>;

interface AgentChannelDescriptor<
  State extends object = object,
  Contract extends ChannelContract = ChannelContract,
> {
  readonly contract: Contract;
  readonly handlers: (state: Readonly<State>) => ChannelHandlers<Contract>;
}

interface AgentFeatureContributions<State extends object = object> {
  readonly tools?: (state: Readonly<State>) => readonly AgentToolContribution[];
  readonly systemPrompt?: (
    state: Readonly<State>,
  ) => AgentSystemPromptContribution;
  readonly skills?: (
    state: Readonly<State>,
  ) => readonly AgentSkillContribution[];
  readonly turnState?: (state: Readonly<State>) => TurnStateContributions;
  readonly modelContext?: (
    state: Readonly<State>,
  ) => readonly AgentContextContribution[];
  /** Protocol is static. Only the handler factory receives viewpoint state. */
  readonly channels?: ReadonlyArray<AgentChannelDescriptor<State>>;
}

/** Reusable, state-free definition admitted from one manifest feature entry. */
export interface AgentFeatureDefinition {
  readonly featureId: string;
  readonly entryDir?: string;
  readonly isBaseToolsProvider?: boolean;
  readonly stateFactory?: ErasedAgentStateFactory;
  readonly agent: AgentFeatureContributions;
}

/** Immutable homogeneous Agent recipe for one accepted workspace generation. */
export interface AgentCompositionDefinition {
  /** Admitted feature definitions in canonical manifest order. */
  readonly features: readonly AgentFeatureDefinition[];
}

/** Snapshot admitted feature definitions without repeating admission policy. */
export function assembleAgentCompositionDefinition(
  definitions: readonly AgentFeatureDefinition[],
): AgentCompositionDefinition {
  return Object.freeze({
    features: Object.freeze(
      definitions.map((feature) =>
        Object.freeze({
          ...feature,
          agent: Object.freeze({
            ...feature.agent,
            ...(feature.agent.channels && {
              channels: Object.freeze(
                feature.agent.channels.map((descriptor) =>
                  Object.freeze({ ...descriptor }),
                ),
              ),
            }),
          }),
        }),
      ),
    ),
  });
}
