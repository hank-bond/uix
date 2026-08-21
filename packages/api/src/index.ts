// The `@uix/api` public facade re-exporting shared feature-author contracts.
//
// The package entry behind the `@uix/api` import. Features that need only the
// shared contract subset import it through this facade, while feature and
// substrate internals import their specific contract modules directly.

export type {
  AgentContextAppender,
  AgentContextContribution,
  AgentContextMaterialization,
  AgentContextMaterializationContext,
  AgentContextUpdater,
  AppendBuffer,
  AppendContribution,
  MaterializedContribution,
  UpdateBuffer,
  UpdateContribution,
} from "./agent-context";
export type { AgentToolContribution, AgentToolDefinition } from "./agent-tools";
export type {
  DocumentStore,
  DocumentStoreFactory,
  DocumentStoreOptions,
  DocumentVersion,
} from "./documents";
export type {
  AgentChannelDefinition,
  AgentFacetFactories,
  AgentFeatureStateBase,
  AgentFeatureStateFactory,
  FeatureDefinition,
  WorkspaceChannelDefinition,
  WorkspaceFacetFactories,
  WorkspaceFeatureStateBase,
  WorkspaceFeatureStateFactory,
} from "./feature";
export { defineFeature } from "./feature";
export type {
  AgentFeatureState,
  AgentFeatureStateBuilder,
  FeatureStateOf,
  WorkspaceFeatureState,
  WorkspaceFeatureStateBuilder,
} from "./feature-state";
export type { FeatureLogFn, FeatureLogger } from "./log";
export type { ResourceContribution, ResourceRequestContext } from "./resources";
export {
  defineSettings,
  type FeatureSettingAddress,
  FeatureSettingAddressSchema,
  type FeatureSettingValueEnvelope,
  FeatureSettingValueEnvelopeSchema,
  type ReadonlySettingsHandle,
  type ReadonlySettingsHandleFrom,
  type SettingsDefinition,
  type SettingsHandle,
  type SettingsHandleFrom,
  type SettingsValues,
} from "./settings";
export {
  defineTurnStateCell,
  type TurnStateCellDefinition,
  type TurnStateContributions,
  type TurnStateHistoryEntry,
  type TurnStateHistoryOptions,
  type TurnStateHistoryReader,
} from "./turn-state";
