// Admits one immutable, reusable Agent composition definition from generation-static feature facets.

import { Type } from "typebox";

import type { AgentContextContribution } from "@uix/api/agent-context";
import type { AgentSkillContribution } from "@uix/api/agent-skills";
import type { AgentSystemPromptContribution } from "@uix/api/agent-system-prompt";
import type { AgentToolContribution } from "@uix/api/agent-tools";
import { toChannelCanonicalId } from "@uix/api/channel-resolution";
import type { ChannelContract, ChannelHandlers } from "@uix/api/channels";
import { isIdToken } from "@uix/api/contribution-id";
import type { AgentFeatureStateBuilder } from "@uix/api/feature-state";
import type { TurnStateContributions } from "@uix/api/turn-state";

/** Constructs one feature's fresh viewpoint-local state. */
export type AgentFeatureStateFactory = (
  state: AgentFeatureStateBuilder<object>,
) => AgentFeatureStateBuilder<object>;

/** One generation-static Agent protocol and its viewpoint-local handler factory. */
export interface AgentChannelDefinition<
  State extends object = object,
  Contract extends ChannelContract = ChannelContract,
> {
  readonly contract: Contract;
  readonly handlers: (state: Readonly<State>) => ChannelHandlers<Contract>;
}

/** Agent facet factories admitted from one feature definition. */
export interface AgentFacetFactories<State extends object = object> {
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
  readonly channels?: ReadonlyArray<AgentChannelDefinition<State>>;
}

/** Reusable, state-free candidate admitted from one manifest feature entry. */
export interface AgentFeatureDefinition {
  readonly featureId: string;
  readonly entryDir?: string;
  readonly isBaseToolsProvider?: boolean;
  readonly stateFactory?: AgentFeatureStateFactory;
  readonly agent: AgentFacetFactories;
}

/**
 * Proof that every generation-static Agent composition invariant was checked
 * once and that the invariant-bearing definition data cannot change afterward.
 */
export class AdmittedAgentCompositionDefinition {
  readonly #features: readonly AgentFeatureDefinition[];

  private constructor(features: readonly AgentFeatureDefinition[]) {
    this.#features = features;
    Object.freeze(this);
  }

  /** Validate and snapshot one accepted generation in manifest order. */
  static admitGeneration(
    candidates: readonly AgentFeatureDefinition[],
  ): AdmittedAgentCompositionDefinition {
    validateGenerationCandidates(candidates);
    return new AdmittedAgentCompositionDefinition(
      Object.freeze(candidates.map(snapshotAgentFeatureDefinition)),
    );
  }

  get features(): readonly AgentFeatureDefinition[] {
    return this.#features;
  }
}

function validateGenerationCandidates(
  candidates: readonly AgentFeatureDefinition[],
): void {
  const featureIds = new Set<string>();
  const channelIds = new Set<string>();
  let baseToolsFeatureId: string | undefined;

  for (const feature of candidates) {
    if (!isIdToken(feature.featureId)) {
      throw new Error(`Invalid Agent feature id: ${feature.featureId}`);
    }
    if (featureIds.has(feature.featureId)) {
      throw new Error(`Agent feature already admitted: ${feature.featureId}`);
    }
    featureIds.add(feature.featureId);

    if (feature.isBaseToolsProvider === true) {
      if (baseToolsFeatureId) {
        throw new Error(
          `Several Agent features provide base tools: ${baseToolsFeatureId}, ${feature.featureId}`,
        );
      }
      if (typeof feature.agent.tools !== "function") {
        throw new Error(
          `Base-tools feature ${feature.featureId} does not provide Agent tools`,
        );
      }
      baseToolsFeatureId = feature.featureId;
    }

    const channels = feature.agent.channels;
    if (channels === undefined) continue;
    for (const channel of channels) {
      validateAgentChannelDefinition(feature.featureId, channel, channelIds);
    }
  }
}

function validateAgentChannelDefinition(
  featureId: string,
  channel: AgentChannelDefinition,
  channelIds: Set<string>,
): void {
  const { contract } = channel;
  if (contract.feature !== featureId) {
    throw new Error(
      `Agent feature ${featureId} cannot admit channels owned by ${contract.feature}`,
    );
  }

  for (const [name, request] of Object.entries(contract.requests)) {
    admitChannelId(channelIds, featureId, name);
    if (!Type.IsSchema(request.requestSchema)) {
      throw new Error(
        `Agent channel ${featureId}.${name} request schema is invalid`,
      );
    }
    if (!Type.IsSchema(request.responseSchema)) {
      throw new Error(
        `Agent channel ${featureId}.${name} response schema is invalid`,
      );
    }
    validateLogPolicy(featureId, name, request.log, [
      "describeRequest",
      "describeResponse",
    ]);
  }

  for (const [name, event] of Object.entries(contract.events)) {
    admitChannelId(channelIds, featureId, name);
    if (!Type.IsSchema(event.event)) {
      throw new Error(
        `Agent channel ${featureId}.${name} event schema is invalid`,
      );
    }
    validateLogPolicy(featureId, name, event.log, ["describeEvent"]);
  }
}

function admitChannelId(
  admitted: Set<string>,
  featureId: string,
  name: string,
): void {
  const canonicalId = toChannelCanonicalId(featureId, name);
  if (admitted.has(canonicalId)) {
    throw new Error(`Agent channel already admitted: ${canonicalId}`);
  }
  admitted.add(canonicalId);
}

function validateLogPolicy(
  featureId: string,
  name: string,
  policy: unknown,
  callbacks: readonly string[],
): void {
  if (policy === undefined) return;
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
    throw new Error(`Agent channel ${featureId}.${name} log policy is invalid`);
  }
  const record = policy as Record<string, unknown>;
  for (const callback of callbacks) {
    if (
      record[callback] !== undefined &&
      typeof record[callback] !== "function"
    ) {
      throw new Error(
        `Agent channel ${featureId}.${name} log callback ${callback} is not a function`,
      );
    }
  }
}

function snapshotAgentFeatureDefinition(
  feature: AgentFeatureDefinition,
): AgentFeatureDefinition {
  return Object.freeze({
    ...feature,
    agent: Object.freeze({
      ...feature.agent,
      ...(feature.agent.channels && {
        channels: Object.freeze(
          feature.agent.channels.map((channel) =>
            Object.freeze({
              contract: toImmutableSnapshot(channel.contract),
              handlers: channel.handlers,
            }),
          ),
        ),
      }),
    }),
  });
}

/** Clone and freeze protocol data while retaining executable callback identity. */
function toImmutableSnapshot<Value>(
  value: Value,
  seen = new WeakMap<object, object>(),
): Value {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return value;
  }
  if (typeof value === "function") return value;

  const existing = seen.get(value);
  if (existing) return existing as Value;

  const prototype = Object.getPrototypeOf(value) as object | null;
  const snapshot: object = Array.isArray(value)
    ? []
    : (Object.create(prototype) as object);
  seen.set(value, snapshot);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    Object.defineProperty(
      snapshot,
      key,
      "value" in descriptor
        ? {
            ...descriptor,
            value: toImmutableSnapshot(descriptor.value as unknown, seen),
          }
        : descriptor,
    );
  }
  return Object.freeze(snapshot) as Value;
}
