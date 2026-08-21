// Checks feature tool names and assigns the Pi name and contribution ID used by the registry.
//
// Ordinary contributions derive `${featureId}__${name}`. The admitted
// base-tools provider retains local names through this same resolver.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { AgentToolContribution } from "@uix/api/agent-tools";
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

export interface ResolvedAgentToolContribution {
  readonly contributionId: ContributionId;
  readonly canonicalId: AgentToolCanonicalId;
  /** Full Pi tool definition, with `name` stamped from the canonical id. */
  readonly tool: ToolDefinition;
}

/**
 * Resolve both ids and stamp `tool.name` from the canonical id. Base-tool
 * providers retain the local name. Every other feature receives its prefix.
 */
export function resolveAgentToolContribution(
  featureId: string,
  contribution: AgentToolContribution,
  options: { readonly isBaseToolsProvider?: boolean } = {},
): ResolvedAgentToolContribution {
  if (options.isBaseToolsProvider) {
    assertAgentToolToken("agent tool name", contribution.name);
  }
  const canonicalId = options.isBaseToolsProvider
    ? (contribution.name as AgentToolCanonicalId)
    : toAgentToolCanonicalId(featureId, contribution.name);
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
