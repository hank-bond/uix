// agent tool contribution types.
//
// Ordinary feature tools derive `${featureId}__${name}`. Explicit override
// contributions retain `name` as the exact Pi tool name so a feature can
// replace a built-in definition without weakening the ordinary namespace.
//
// A tool body is inherently a pi artifact, so AgentToolDefinition is pi's
// ToolDefinition minus `name` — re-exported here so feature authors get the
// real pi typing from @uix/api without reaching into cockpit internals.

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

/**
 * The tool body an author provides: everything in a pi `ToolDefinition` except
 * `name`, which the facet derives from `(featureId, name)` and stamps during
 * normalization. Making it `Omit` turns an author hand-writing `name` into a
 * compile error.
 *
 * Generic on the parameter schema so a reusable tool factory can narrow it —
 * `AgentToolDefinition<typeof myParams>` — which threads `Static<TParams>`
 * contextually into `execute`, `renderCall`, and `prepareArguments` and
 * type-checks the `parameters` field against the specific schema. Defaults to
 * the widened `TSchema` so one-off inline tool literals can use the bare alias.
 * (Pi's own `createReadToolDefinition` uses `ToolDefinition<typeof readSchema>`
 * the same way; this mirrors that for feature-authored tools.)
 */
export type AgentToolDefinition<TParams extends TSchema = TSchema> = Omit<
  ToolDefinition<TParams>,
  "name"
>;

export interface AgentToolContribution {
  /** Local tool name: the facet derives `${featureId}__${name}` as the Pi tool name. */
  readonly name: string;
  /** Tool body — everything except `name`, which the substrate derives. */
  readonly tool: AgentToolDefinition;
}

/**
 * An intentional exact-name replacement for a Pi tool definition. This is a
 * separate contribution shape so ordinary feature tools cannot accidentally
 * escape their feature namespace.
 */
export interface AgentToolOverrideContribution {
  /** Exact Pi tool name to register, such as `read` or `write`. */
  readonly name: string;
  /** Replacement body — the substrate stamps the exact `name`. */
  readonly tool: AgentToolDefinition;
}
