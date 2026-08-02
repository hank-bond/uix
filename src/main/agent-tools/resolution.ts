// agent tool contribution resolution.
//
// Every tool gets a feature-owned `ContributionId` registry key. Ordinary
// contributions derive a namespaced Pi tool name (`${featureId}__${name}`),
// while explicit exact-name contributions retain their authored name.
// Keeping those author shapes separate prevents ordinary feature tools from
// accidentally escaping their namespace.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type {
  AgentToolContribution,
  AgentToolDefinition,
  AgentToolOverrideContribution,
} from "@uix/api/agent-tools";
import {
  toContributionId,
  type ContributionId,
} from "@uix/api/contribution-id";

/**
 * Canonical agent tool id: the pi tool name. Drops the facet segment (the tool
 * kind is implicit in pi) and uses pi's double-underscore separator:
 * `${featureId}__${name}` (e.g. `canvas__anchor_read`).
 */
const AgentToolCanonicalIdBrand: unique symbol = Symbol("AgentToolCanonicalId");

export type AgentToolCanonicalId = string & {
  readonly [AgentToolCanonicalIdBrand]: true;
};

/**
 * Builds the pi tool name for a contribution: `${featureId}__${name}`.
 * Validates each segment; a failure is an app bug.
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

// The author-facing tool-body alias lives in @uix/api/agent-tools (a tool
// body is a pi artifact; features get the real pi typing from the API).
// Re-exported here so main-internal call sites keep one import path.
export type { AgentToolDefinition } from "@uix/api/agent-tools";

export interface ResolvedAgentToolContribution {
  readonly contributionId: ContributionId;
  readonly canonicalId: AgentToolCanonicalId;
  /** Full pi tool definition, with `name` stamped from the canonical id. */
  readonly tool: ToolDefinition;
}

/**
 * Derives both ids for an agent tool contribution and stamps `tool.name` from
 * the canonical id. Pure; no registry, no side effects.
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
