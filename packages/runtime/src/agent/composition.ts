// Instantiates one admitted Agent recipe into viewpoint-local feature states and registries.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  AgentCompositionDefinition,
  AgentFeatureDefinition,
} from "./composition-definition";
import { createAgentCompositionFacetState } from "./composition-registries";
import type { AgentInstaller } from "./installers";
import { createSystemPromptAssembler } from "./system-prompt";
import {
  assembleAgentContextVocabularySection,
  registerAgentContextContributions,
} from "../agent-context/registry";
import {
  createAgentSkillInstaller,
  registerAgentSkillContributions,
} from "../agent-skill-registry";
import {
  assembleAgentSystemPromptSection,
  registerAgentSystemPromptContribution,
} from "../agent-system-prompt-registry";
import {
  createAgentToolInstaller,
  registerAgentToolContributions,
} from "../agent-tools/registry";
import {
  type FeatureOperationOutcome,
  toBlockedOperationOutcome,
  toFailedOperationOutcome,
  toSucceededOperationOutcome,
} from "../feature-operation-outcome";
import { createFeatureStateOwnership } from "../feature-state";
import { AsyncDisposableBag, DisposableBag } from "../lifecycle";
import {
  createTurnStateInstaller,
  registerTurnStateContributions,
} from "../turn-state";

type AgentCompositionFacetState = ReturnType<
  typeof createAgentCompositionFacetState
>;
type AgentFeatureFacet = keyof AgentFeatureDefinition["agent"];
type Attempt<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: unknown };

const AgentFeatureFacetOrder = [
  "tools",
  "turnState",
  "skills",
  "systemPrompt",
  "modelContext",
  "channels",
] as const satisfies readonly AgentFeatureFacet[];

export interface AgentCompositionInstance {
  readonly definition: AgentCompositionDefinition;
  readonly featureStates: AgentCompositionFacetState["featureStateView"];
  readonly registries: AgentCompositionFacetState["registryCapabilities"];
  /** List completed state construction, contribution, and registration outcomes. */
  listOutcomes(): readonly FeatureOperationOutcome[];
}

/** Setup-time capability for installing one accepted Agent snapshot into Pi. */
export interface AgentCompositionInstaller {
  /** Install each complete instance registry according to its natural Pi semantics. */
  install(pi: ExtensionAPI): Promise<void>;
}

export type AgentCompositionInstanceOwnership = AgentCompositionInstance &
  AgentCompositionInstaller &
  AsyncDisposable;

interface CreateAgentCompositionInstanceOptions {
  readonly definition: AgentCompositionDefinition;
  /** Construct the fresh substrate base for one feature and viewpoint. */
  readonly createFeatureStateBase: (feature: AgentFeatureDefinition) => object;
}

/** Instantiate admitted feature states and register each declared facet independently. */
export async function createAgentCompositionInstance(
  options: CreateAgentCompositionInstanceOptions,
): Promise<AgentCompositionInstanceOwnership> {
  const compositionBag = new AsyncDisposableBag();
  const { featureStates, featureStateView, registries, registryCapabilities } =
    createAgentCompositionFacetState();
  const outcomes: FeatureOperationOutcome[] = [];

  try {
    for (const feature of options.definition.features) {
      const featureBag = new AsyncDisposableBag();
      let state: Readonly<object>;
      try {
        const stateOwnership = await createFeatureStateOwnership({
          lane: "agent",
          base: options.createFeatureStateBase(feature),
          ...(feature.stateFactory && { build: feature.stateFactory }),
        });
        state = stateOwnership.state;
        featureBag.add(stateOwnership);
        featureBag.add(featureStates.register(feature.featureId, state));
        compositionBag.add(featureBag);
        outcomes.push(
          toSucceededOperationOutcome(feature.featureId, "agent", "state"),
        );
      } catch (error) {
        const stateError = await rollbackFailedFeatureState(
          feature.featureId,
          featureBag,
          error,
        );
        outcomes.push(
          toFailedOperationOutcome(
            feature.featureId,
            "agent",
            "state",
            stateError,
          ),
        );
        recordBlockedFeatureContributions(outcomes, feature, stateError);
        continue;
      }

      const instantiateFacet = <Value>(
        facet: AgentFeatureFacet,
        contribute: () => Value,
        register: (value: Value) => Disposable | AsyncDisposable,
      ): void => {
        instantiateAgentFacet({
          outcomes,
          featureBag,
          featureId: feature.featureId,
          facet,
          contribute,
          register,
        });
      };

      const toolsFactory = feature.agent.tools;
      if (toolsFactory) {
        instantiateFacet(
          "tools",
          () => toolsFactory(state),
          (contributions) =>
            registerAgentToolContributions(
              registries.tools,
              feature.featureId,
              contributions,
              { isBaseToolsProvider: feature.isBaseToolsProvider === true },
            ),
        );
      }

      const turnStateFactory = feature.agent.turnState;
      if (turnStateFactory) {
        instantiateFacet(
          "turnState",
          () => turnStateFactory(state),
          (contributions) =>
            registerTurnStateContributions(
              registries.turnState,
              feature.featureId,
              contributions,
            ),
        );
      }

      const skillsFactory = feature.agent.skills;
      if (skillsFactory) {
        instantiateFacet(
          "skills",
          () => skillsFactory(state),
          (contributions) => {
            if (contributions.length > 0 && !feature.entryDir) {
              throw new Error(
                `Agent feature ${feature.featureId} contributes skills without an entry directory`,
              );
            }
            return registerAgentSkillContributions(
              registries.skills,
              feature.featureId,
              contributions,
              feature.entryDir ?? ".",
            );
          },
        );
      }

      const systemPromptFactory = feature.agent.systemPrompt;
      if (systemPromptFactory) {
        instantiateFacet(
          "systemPrompt",
          () => systemPromptFactory(state),
          (contribution) =>
            registerAgentSystemPromptContribution(
              registries.systemPrompt,
              feature.featureId,
              contribution,
            ),
        );
      }

      const modelContextFactory = feature.agent.modelContext;
      if (modelContextFactory) {
        instantiateFacet(
          "modelContext",
          () => modelContextFactory(state),
          (contributions) =>
            registerAgentContextContributions(
              registries.modelContext,
              feature.featureId,
              contributions,
            ),
        );
      }

      const channelDescriptors = feature.agent.channels;
      if (channelDescriptors) {
        instantiateFacet(
          "channels",
          () =>
            channelDescriptors.map((descriptor) => ({
              contract: descriptor.contract,
              handlers: descriptor.handlers(state),
            })),
          (groups) => {
            const channelBag = new DisposableBag();
            try {
              for (const group of groups) {
                channelBag.add(
                  registries.channels.register({
                    featureId: feature.featureId,
                    contract: group.contract,
                    handlers: group.handlers,
                  }),
                );
              }
              return channelBag;
            } catch (error) {
              channelBag[Symbol.dispose]();
              throw error;
            }
          },
        );
      }
    }
  } catch (creationError) {
    try {
      await compositionBag[Symbol.asyncDispose]();
    } catch (disposalError) {
      throw new AggregateError(
        [creationError, disposalError],
        "Agent composition creation and rollback failed",
        { cause: disposalError },
      );
    }
    throw creationError;
  }

  const installers: AgentInstaller[] = [];
  if (registries.tools.list().length > 0) {
    installers.push(createAgentToolInstaller(registries.tools));
  }
  if (registries.turnState.list().length > 0) {
    installers.push(createTurnStateInstaller(registries.turnState));
  }
  if (registries.skills.list().length > 0) {
    installers.push(createAgentSkillInstaller(registries.skills));
  }
  if (
    registries.systemPrompt.list().length > 0 ||
    registries.modelContext.list().length > 0
  ) {
    installers.push(
      createSystemPromptAssembler([
        () => assembleAgentSystemPromptSection(registries.systemPrompt),
        () => assembleAgentContextVocabularySection(registries.modelContext),
      ]),
    );
  }
  const install = async (pi: ExtensionAPI): Promise<void> => {
    for (const installer of installers) await installer(pi);
  };

  let disposal: Promise<void> | undefined;
  return {
    definition: options.definition,
    featureStates: featureStateView,
    registries: registryCapabilities,
    listOutcomes: () => [...outcomes],
    install,
    [Symbol.asyncDispose]() {
      disposal ??= compositionBag[Symbol.asyncDispose]();
      return disposal;
    },
  };
}

function instantiateAgentFacet<Value>(options: {
  readonly outcomes: FeatureOperationOutcome[];
  readonly featureBag: AsyncDisposableBag;
  readonly featureId: string;
  readonly facet: AgentFeatureFacet;
  readonly contribute: () => Value;
  readonly register: (value: Value) => Disposable | AsyncDisposable;
}): void {
  const contribution = runAgentFacetOperation(
    options.outcomes,
    options.featureId,
    "contribution",
    options.facet,
    options.contribute,
  );
  if (!contribution.ok) {
    options.outcomes.push(
      toBlockedOperationOutcome(
        options.featureId,
        "agent",
        "registration",
        options.facet,
        contribution.error,
      ),
    );
    return;
  }

  const registration = runAgentFacetOperation(
    options.outcomes,
    options.featureId,
    "registration",
    options.facet,
    () => options.register(contribution.value),
  );
  if (registration.ok) options.featureBag.add(registration.value);
}

function runAgentFacetOperation<Value>(
  outcomes: FeatureOperationOutcome[],
  featureId: string,
  phase: "contribution" | "registration",
  facet: AgentFeatureFacet,
  operation: () => Value,
): Attempt<Value> {
  try {
    const value = operation();
    outcomes.push(
      toSucceededOperationOutcome(featureId, "agent", phase, facet),
    );
    return { ok: true, value };
  } catch (error) {
    outcomes.push(
      toFailedOperationOutcome(featureId, "agent", phase, error, facet),
    );
    return { ok: false, error };
  }
}

function recordBlockedFeatureContributions(
  outcomes: FeatureOperationOutcome[],
  feature: AgentFeatureDefinition,
  error: unknown,
): void {
  for (const facet of AgentFeatureFacetOrder) {
    if (!feature.agent[facet]) continue;
    outcomes.push(
      toBlockedOperationOutcome(
        feature.featureId,
        "agent",
        "contribution",
        facet,
        error,
      ),
    );
  }
}

async function rollbackFailedFeatureState(
  featureId: string,
  featureBag: AsyncDisposableBag,
  error: unknown,
): Promise<unknown> {
  try {
    await featureBag[Symbol.asyncDispose]();
    return error;
  } catch (disposalError) {
    return new AggregateError(
      [error, disposalError],
      `Agent feature ${featureId} state creation and rollback failed`,
      { cause: disposalError },
    );
  }
}
