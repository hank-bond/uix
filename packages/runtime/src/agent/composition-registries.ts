// Defines the instance-local registry bundle and operational views for one Agent composition.

import {
  type ChannelCanonicalId,
  toChannelCanonicalId,
} from "@uix/api/channel-resolution";
import type { ChannelContract, ChannelHandlers } from "@uix/api/channels";

import { AgentContextRegistry } from "../agent-context/registry";
import { AgentSkillRegistry } from "../agent-skill-registry";
import { AgentSystemPromptRegistry } from "../agent-system-prompt-registry";
import { AgentToolRegistry } from "../agent-tools/registry";
import { disposable } from "../lifecycle";
import { TurnStateRegistry } from "../turn-state";

interface AgentFeatureStateEntry {
  readonly featureId: string;
  readonly state: Readonly<object>;
}

/** Viewpoint-local collection of completed feature states. */
class AgentFeatureStateCollection {
  readonly #states = new Map<string, Readonly<object>>();

  register(featureId: string, state: Readonly<object>): Disposable {
    if (this.#states.has(featureId)) {
      throw new Error(`Agent feature state already registered: ${featureId}`);
    }
    this.#states.set(featureId, state);
    return disposable(() => {
      if (this.#states.get(featureId) === state) this.#states.delete(featureId);
    });
  }

  get(featureId: string): Readonly<object> | undefined {
    return this.#states.get(featureId);
  }

  list(): readonly AgentFeatureStateEntry[] {
    return [...this.#states].map(([featureId, state]) => ({
      featureId,
      state,
    }));
  }
}

interface ResolvedAgentChannelHandlers {
  readonly featureId: string;
  readonly contract: ChannelContract;
  readonly handlers: ChannelHandlers<ChannelContract>;
}

/** Per-instance handler tables, kept separate from generation-static contracts. */
class AgentChannelHandlerRegistry {
  readonly #groups: ResolvedAgentChannelHandlers[] = [];
  readonly #canonicalIds = new Set<ChannelCanonicalId>();

  register(group: ResolvedAgentChannelHandlers): Disposable {
    if (group.contract.feature !== group.featureId) {
      throw new Error(
        `Agent feature ${group.featureId} cannot bind channels owned by ${group.contract.feature}`,
      );
    }

    const requestNames = Object.keys(group.contract.requests);
    const handlerNames = Object.keys(group.handlers);
    const missing = requestNames.filter((name) => !(name in group.handlers));
    const extra = handlerNames.filter(
      (name) => !(name in group.contract.requests),
    );
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `Agent channel handlers for ${group.featureId} do not match the contract (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
      );
    }

    for (const name of requestNames) {
      if (typeof group.handlers[name].handler !== "function") {
        throw new Error(
          `Agent channel handler ${group.featureId}.${name} is not a function`,
        );
      }
    }

    const canonicalIds = [
      ...requestNames,
      ...Object.keys(group.contract.events),
    ].map((name) => toChannelCanonicalId(group.featureId, name));
    const localIds = new Set<ChannelCanonicalId>();
    let duplicate: ChannelCanonicalId | undefined;
    for (const canonicalId of canonicalIds) {
      if (localIds.has(canonicalId) || this.#canonicalIds.has(canonicalId)) {
        duplicate = canonicalId;
        break;
      }
      localIds.add(canonicalId);
    }
    if (duplicate) throw new Error(`Agent channel already bound: ${duplicate}`);

    this.#groups.push(group);
    for (const canonicalId of canonicalIds) this.#canonicalIds.add(canonicalId);
    return disposable(() => {
      const index = this.#groups.indexOf(group);
      if (index !== -1) this.#groups.splice(index, 1);
      for (const canonicalId of canonicalIds) {
        this.#canonicalIds.delete(canonicalId);
      }
    });
  }

  list(): readonly ResolvedAgentChannelHandlers[] {
    return [...this.#groups];
  }
}

interface AgentFeatureStateView {
  get(featureId: string): Readonly<object> | undefined;
  list(): readonly AgentFeatureStateEntry[];
}

interface AgentCompositionRegistries {
  readonly tools: AgentToolRegistry;
  readonly systemPrompt: AgentSystemPromptRegistry;
  readonly skills: AgentSkillRegistry;
  readonly turnState: TurnStateRegistry;
  readonly modelContext: AgentContextRegistry;
  readonly channels: AgentChannelHandlerRegistry;
}

type RegistryListCapabilities<
  Registries extends {
    readonly [Key in keyof Registries]: { list(): unknown };
  },
> = {
  readonly [Key in keyof Registries]: Pick<Registries[Key], "list">;
};

interface AgentCompositionFacetState {
  readonly featureStates: AgentFeatureStateCollection;
  readonly featureStateView: AgentFeatureStateView;
  readonly registries: AgentCompositionRegistries;
  readonly registryCapabilities: RegistryListCapabilities<AgentCompositionRegistries>;
}

/** Create fresh feature state and registry authority for one Agent viewpoint. */
export function createAgentCompositionFacetState(): AgentCompositionFacetState {
  const featureStates = new AgentFeatureStateCollection();
  const registries: AgentCompositionRegistries = {
    tools: new AgentToolRegistry(),
    systemPrompt: new AgentSystemPromptRegistry(),
    skills: new AgentSkillRegistry(),
    turnState: new TurnStateRegistry(),
    modelContext: new AgentContextRegistry(),
    channels: new AgentChannelHandlerRegistry(),
  };
  return {
    featureStates,
    registries,
    featureStateView: {
      get: (featureId) => featureStates.get(featureId),
      list: () => featureStates.list(),
    },
    registryCapabilities: {
      tools: { list: () => registries.tools.list() },
      systemPrompt: { list: () => registries.systemPrompt.list() },
      skills: { list: () => registries.skills.list() },
      turnState: { list: () => registries.turnState.list() },
      modelContext: { list: () => registries.modelContext.list() },
      channels: { list: () => registries.channels.list() },
    },
  };
}
