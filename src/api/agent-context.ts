// agent-context contribution type.
//
// A agent-context contribution declares one model-visible state section: its
// name, vocabulary line, optional UIX-managed buffer, and optional materializer.
// Features that declare update or append buffers receive a typed handle back
// from the registry (AgentContextUpdater / AgentContextAppender) that lets them
// push state independently of the contribution lifecycle.

import type { Static, TSchema } from "typebox";

import type { TurnStateHistoryReader } from "./turn-state";

export type { TurnStateHistoryReader } from "./turn-state";

export interface AgentContextMaterialization {
  /** Body rendered inside this contribution's state tag; this is what the model sees. */
  content: string;
  /** Optional structured sidecar persisted with the combined custom message. */
  details?: unknown;
}

/**
 * Context passed to AgentContextContribution materializers. Arrives after
 * turn-state prep, so turnState() resolves to the latest committed state.
 */
export type AgentContextMaterializationContext = TurnStateHistoryReader;

type MaybePromise<T> = T | Promise<T>;

interface BaseContribution {
  name: string;
  /** Vocabulary line describing this section's body to the model. */
  description: string;
}

export interface UpdateBuffer<T extends TSchema> {
  kind: "update";
  /** Validates update payloads; a failure is an app bug. */
  schema: T;
}

export interface AppendBuffer<T extends TSchema> {
  kind: "append";
  /** Validates appended payloads; a failure is an app bug. */
  schema: T;
}

export interface UpdateContribution<
  T extends TSchema,
> extends BaseContribution {
  buffer: UpdateBuffer<T>;
  /** Optional initial update applied by bulk contribution registration. */
  initialValue?: Static<T>;
  /** Optional formatter; default is JSON.stringify(value) with value as details. */
  materialize?: (input: {
    value: Static<T>;
  }) => MaybePromise<AgentContextMaterialization | undefined>;
}

export interface AppendContribution<
  T extends TSchema,
> extends BaseContribution {
  buffer: AppendBuffer<T>;
  /** Optional formatter; default is JSON.stringify(values) with values as details. */
  materialize?: (input: {
    values: readonly Static<T>[];
  }) => MaybePromise<AgentContextMaterialization | undefined>;
}

export interface MaterializedContribution extends BaseContribution {
  buffer?: never;
  /** Called while UIX prepares an agent run; owns any external state it touches. */
  materialize: (
    ctx: AgentContextMaterializationContext,
  ) => MaybePromise<AgentContextMaterialization | undefined>;
}

export type AgentContextContribution =
  | UpdateContribution<TSchema>
  | AppendContribution<TSchema>
  | MaterializedContribution;

export interface AgentContextUpdater<T extends TSchema> extends Disposable {
  update(payload: Static<T>): void;
}

export interface AgentContextAppender<T extends TSchema> extends Disposable {
  append(payload: Static<T>): void;
}
