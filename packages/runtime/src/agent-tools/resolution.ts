// Checks feature tool names and assigns the Pi name and contribution ID used by the registry.
//
// Ordinary contributions derive `${featureId}__${name}` while explicit
// overrides retain their authored Pi name, preventing ordinary feature tools
// from escaping their owner namespace.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type {
  AgentToolContribution,
  AgentToolDefinition,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";
import {
  type ContributionId,
  toContributionId,
} from "@uix/api/contribution-id";

/**
 * Canonical agent tool id: the Pi tool name. Drops the facet segment (the tool
 * kind is implicit in Pi) and uses Pi's double-underscore separator:
 * `${featureId}__${name}` (e.g. `canvas__anchor_read`).
 */
const AgentToolCanonicalIdBrand: unique symbol = Symbol("AgentToolCanonicalId");

export type AgentToolCanonicalId = string & {
  readonly [AgentToolCanonicalIdBrand]: true;
};

/**
 * Builds the Pi tool name for a contribution: `${featureId}__${name}`.
 * Validates each segment. A failure is an app bug.
 */
export function toAgentToolCanonicalId(
  featureId: string,
  name: string,
): AgentToolCanonicalId {
  assertAgentToolToken("feature id", featureId);
  assertAgentToolToken("agent tool name", name);
  return `${featureId}__${name}` as AgentToolCanonicalId;
}

/** Validates and retains an intentional exact Pi tool name. */
export function toAgentToolOverrideCanonicalId(
  name: string,
): AgentToolCanonicalId {
  assertAgentToolToken("agent tool override name", name);
  return name as AgentToolCanonicalId;
}

export interface ResolvedAgentToolContribution {
  readonly contributionId: ContributionId;
  readonly canonicalId: AgentToolCanonicalId;
  /** Full Pi tool definition, with `name` stamped from the canonical id. */
  readonly tool: ToolDefinition;
}

/**
 * Derives both ids for an agent tool contribution and stamps `tool.name` from
 * the canonical id. Pure. No registry, no side effects.
 */
export function resolveAgentToolContribution(
  featureId: string,
  contribution: AgentToolContribution,
): ResolvedAgentToolContribution {
  return resolveAgentTool(
    featureId,
    contribution,
    toAgentToolCanonicalId(featureId, contribution.name),
  );
}

/** Retains the authored Pi name and stamps it onto an exact-name definition. */
export function resolveAgentToolOverrideContribution(
  featureId: string,
  contribution: AgentToolOverrideContribution,
): ResolvedAgentToolContribution {
  return resolveAgentTool(
    featureId,
    contribution,
    toAgentToolOverrideCanonicalId(contribution.name),
  );
}

function resolveAgentTool(
  featureId: string,
  contribution: { readonly name: string; readonly tool: AgentToolDefinition },
  canonicalId: AgentToolCanonicalId,
): ResolvedAgentToolContribution {
  return {
    contributionId: toContributionId(featureId, "agent", contribution.name),
    canonicalId,
    tool: { ...contribution.tool, name: canonicalId },
  };
}

function assertAgentToolToken(label: string, token: string): void {
  const agentToolTokenPattern = /^[a-z][a-z0-9_]*$/;
  if (!agentToolTokenPattern.test(token)) {
    throw new Error(
      `Invalid ${label}: ${token}. Expected ${String(agentToolTokenPattern)}.`,
    );
  }
}
