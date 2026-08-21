// Agent tool contribution types.
//
// Ordinary feature tools derive `${featureId}__${name}`. The manifest's sole
// base-tools provider retains local names through the same contribution path.
//
// A tool body is inherently a Pi artifact, so AgentToolDefinition is Pi's
// ToolDefinition minus `name`. It is re-exported here so feature authors get the
// real Pi typing from @uix/api without reaching into host internals.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

/**
 * The tool body an author provides: everything in a Pi `ToolDefinition` except
 * `name`, which the facet derives from `(featureId, name)` and stamps during
 * normalization. Making it `Omit` turns an author hand-writing `name` into a
 * compile error.
 *
 * Generic on the parameter schema so a reusable tool factory can narrow it to
 * `AgentToolDefinition<typeof myParams>`, which threads `Static<TParams>`
 * contextually into `execute`, `renderCall`, and `prepareArguments` and
 * type-checks the `parameters` field against the specific schema. Defaults to
 * the widened `TSchema` so one-off inline tool literals can use the bare alias.
 * (Pi's own `createReadToolDefinition` uses `ToolDefinition<typeof readSchema>`
 * the same way. This mirrors that for feature-authored tools.)
 */
export type AgentToolDefinition<TParams extends TSchema = TSchema> = Omit<
  ToolDefinition<TParams>,
  "name"
>;

export interface AgentToolContribution {
  /**
   * Local tool name. The substrate derives `${featureId}__${name}` unless the
   * manifest admits this feature as the base-tools provider.
   */
  readonly name: string;
  /** Tool body: everything except `name`, which the substrate derives. */
  readonly tool: AgentToolDefinition;
}
