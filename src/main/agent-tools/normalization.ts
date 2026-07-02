// agent tool contribution id derivation.
//
// Feature authors give a local `name` and the tool body (everything but the
// pi tool `name`). This module derives the two ids the registry and the agent
// installer need:
//
//   - `ContributionId` (`${featureId}.agent.<name>`) — the registry dedup key,
//     shared across facets via `@uix/api/contribution-id`.
//   - `AgentToolCanonicalId` (`${featureId}__${name>`) — the pi tool name,
//     i.e. the address the agent calls. The facet segment is dropped because
//     within pi the "this is a tool" kind is implicit; the `__` separator is
//     pi's own tool-naming convention.
//
// Unlike channels, nothing here is renderer-importable: the only consumers are
// the agent-tool registry and the pi installer, both in main. The one genuinely
// cross-facet piece — the ContributionId grammar — stays in `#shared`.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

import type { AgentToolDefinition } from "@uix/api/agent-tools";
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

// The author-facing tool-body alias lives in @uix/api/agent-tools (a tool
// body is a pi artifact; features get the real pi typing from the API).
// Re-exported here so main-internal call sites keep one import path.
export type { AgentToolDefinition } from "@uix/api/agent-tools";

export interface AgentToolRegistration {
  readonly contributionId: ContributionId;
  readonly canonicalId: AgentToolCanonicalId;
  /** Full pi tool definition, with `name` stamped from the canonical id. */
  readonly tool: ToolDefinition;
}

/**
 * Derives both ids for an agent tool contribution and stamps `tool.name` from
 * the canonical id. Pure; no registry, no side effects.
 */
export function normalizeAgentToolContribution(
  featureId: string,
  contribution: { readonly name: string; readonly tool: AgentToolDefinition },
): AgentToolRegistration {
  const canonicalId = toAgentToolCanonicalId(featureId, contribution.name);
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
      `Invalid ${label}: ${token}. Expected ${agentToolTokenPattern}.`,
    );
  }
}
