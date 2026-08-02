// agent-context contribution resolution.
//
// Resolution derives the feature-owned ids that make an authored contribution
// registry-ready. It does not create the mutable buffer state owned by the
// registry after an update or append contribution is accepted.

import type { TSchema } from "typebox";

import type {
  AgentContextContribution,
  AgentContextMaterialization,
  AgentContextMaterializationContext,
  AppendContribution,
  MaterializedContribution,
  UpdateContribution,
} from "@uix/api/agent-context";
import {
  type ContributionId,
  toContributionId,
} from "@uix/api/contribution-id";

type MaybePromise<T> = T | Promise<T>;

const AgentContextCanonicalIdBrand: unique symbol = Symbol(
  "AgentContextCanonicalId",
);

export type AgentContextCanonicalId = string & {
  readonly [AgentContextCanonicalIdBrand]: true;
};

export interface ResolvedAgentContextContributionBase {
  readonly featureId: string;
  readonly contributionId: ContributionId;
  readonly canonicalId: AgentContextCanonicalId;
  readonly description: string;
}

export interface ResolvedAgentContextUpdateContribution extends ResolvedAgentContextContributionBase {
  readonly kind: "update";
  readonly schema: TSchema;
  readonly materialize?: (input: {
    value: unknown;
  }) => MaybePromise<AgentContextMaterialization | undefined>;
}

export interface ResolvedAgentContextAppendContribution extends ResolvedAgentContextContributionBase {
  readonly kind: "append";
  readonly schema: TSchema;
  readonly materialize?: (input: {
    values: readonly unknown[];
  }) => MaybePromise<AgentContextMaterialization | undefined>;
}

export interface ResolvedAgentContextMaterializedContribution extends ResolvedAgentContextContributionBase {
  readonly kind: "materialized";
  readonly materialize: (
    ctx: AgentContextMaterializationContext,
  ) => MaybePromise<AgentContextMaterialization | undefined>;
}

export type ResolvedAgentContextContribution =
  | ResolvedAgentContextUpdateContribution
  | ResolvedAgentContextAppendContribution
  | ResolvedAgentContextMaterializedContribution;

/**
 * Derives the owner-scoped ids and registry-ready shape for one contribution.
 * Pure; no registry membership or mutable buffer state is created.
 */
export function resolveAgentContextContribution<T extends TSchema>(
  featureId: string,
  contribution: UpdateContribution<T>,
): ResolvedAgentContextUpdateContribution;
export function resolveAgentContextContribution<T extends TSchema>(
  featureId: string,
  contribution: AppendContribution<T>,
): ResolvedAgentContextAppendContribution;
export function resolveAgentContextContribution(
  featureId: string,
  contribution: MaterializedContribution,
): ResolvedAgentContextMaterializedContribution;
export function resolveAgentContextContribution(
  featureId: string,
  contribution: AgentContextContribution,
): ResolvedAgentContextContribution;
export function resolveAgentContextContribution(
  featureId: string,
  contribution: AgentContextContribution,
): ResolvedAgentContextContribution {
  const base = {
    featureId,
    contributionId: toContributionId(
      featureId,
      "agent-context",
      contribution.name,
    ),
    canonicalId: toAgentContextCanonicalId(featureId, contribution.name),
    description: contribution.description,
  };

  if (contribution.buffer?.kind === "update") {
    const update = contribution as UpdateContribution<TSchema>;
    return {
      ...base,
      kind: "update",
      schema: update.buffer.schema,
      materialize: update.materialize,
    };
  }

  if (contribution.buffer?.kind === "append") {
    const append = contribution as AppendContribution<TSchema>;
    return {
      ...base,
      kind: "append",
      schema: append.buffer.schema,
      materialize: append.materialize,
    };
  }

  const materialized = contribution as MaterializedContribution;
  return {
    ...base,
    kind: "materialized",
    materialize: materialized.materialize,
  };
}

/** Builds `${featureId}.${name}` and validates both id segments. */
export function toAgentContextCanonicalId(
  featureId: string,
  name: string,
): AgentContextCanonicalId {
  assertAgentContextToken("feature id", featureId);
  assertAgentContextToken("state message name", name);
  return `${featureId}.${name}` as AgentContextCanonicalId;
}

function assertAgentContextToken(label: string, token: string): void {
  const pattern = /^[a-z][a-z0-9_-]*$/;
  if (!pattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${String(pattern)}.`);
  }
}
