// Grouped feature author contract.
//
// A manifest-selected feature declares optional Workspace and Agent state
// prerequisites plus independent contribution factories in those authority
// lanes. The substrate constructs each state before invoking its matching
// section and privately controls sibling operation order.

import type { AgentContextContribution } from "./agent-context";
import type { AgentSkillContribution } from "./agent-skills";
import type { AgentSystemPromptContribution } from "./agent-system-prompt";
import type { AgentToolContribution } from "./agent-tools";
import type {
  ChannelContract,
  ChannelHandlers,
  FeatureEventPublisherFactory,
} from "./channels";
import type { DocumentStoreFactory } from "./documents";
import type {
  AgentFeatureStateBuilder,
  FeatureStateOf,
  WorkspaceFeatureStateBuilder,
} from "./feature-state";
import type { FeatureLogger } from "./log";
import type { ResourceContribution } from "./resources";
import type {
  ReadonlySettingsHandle,
  ReadonlySettingsHandleFrom,
  SettingsDefinition,
  SettingsHandle,
  SettingsHandleFrom,
} from "./settings";
import type { TurnStateContributions } from "./turn-state";

export type { AgentContextContribution } from "./agent-context";
export type { AgentSkillContribution } from "./agent-skills";
export type { AgentSystemPromptContribution } from "./agent-system-prompt";
export type { AgentToolContribution } from "./agent-tools";
export type { DocumentStoreFactory } from "./documents";
export type { FeatureLogger } from "./log";
export type { ResourceContribution } from "./resources";
export type {
  ReadonlySettingsHandle,
  SettingsDefinition,
  SettingsHandle,
} from "./settings";
export type {
  TurnStateCellDefinition,
  TurnStateContributions,
} from "./turn-state";

type WritableFeatureSettings<Settings extends SettingsDefinition | undefined> =
  [Settings] extends [SettingsDefinition]
    ? SettingsHandleFrom<Extract<Settings, SettingsDefinition>>
    : SettingsHandle;

type ReadonlyFeatureSettings<Settings extends SettingsDefinition | undefined> =
  [Settings] extends [SettingsDefinition]
    ? ReadonlySettingsHandleFrom<Extract<Settings, SettingsDefinition>>
    : ReadonlySettingsHandle;

/** Substrate fields available while constructing one Workspace feature state. */
export interface WorkspaceFeatureStateBase<
  Settings extends SettingsDefinition | undefined = undefined,
> {
  readonly documents: DocumentStoreFactory;
  readonly settings: WritableFeatureSettings<Settings>;
  readonly channels: FeatureEventPublisherFactory;
  readonly log: FeatureLogger;
}

/** Substrate fields available while constructing one viewpoint-local Agent state. */
export interface AgentFeatureStateBase<
  Settings extends SettingsDefinition | undefined = undefined,
> {
  readonly settings: ReadonlyFeatureSettings<Settings>;
  readonly channels: FeatureEventPublisherFactory;
  readonly log: FeatureLogger;
}

/** Synchronous construction of one Workspace feature state's live object graph. */
export type WorkspaceFeatureStateFactory<
  Settings extends SettingsDefinition | undefined = undefined,
  Built extends WorkspaceFeatureStateBuilder<object> =
    WorkspaceFeatureStateBuilder<WorkspaceFeatureStateBase<Settings>>,
> = (
  state: WorkspaceFeatureStateBuilder<WorkspaceFeatureStateBase<Settings>>,
) => Built;

/** Synchronous construction of one fresh viewpoint-local Agent feature state. */
export type AgentFeatureStateFactory<
  Settings extends SettingsDefinition | undefined = undefined,
  Built extends AgentFeatureStateBuilder<object> = AgentFeatureStateBuilder<
    AgentFeatureStateBase<Settings>
  >,
> = (state: AgentFeatureStateBuilder<AgentFeatureStateBase<Settings>>) => Built;

/** One static Workspace protocol with handlers bound from Workspace state. */
export interface WorkspaceChannelDefinition<
  State extends object = object,
  Contract extends ChannelContract = ChannelContract,
> {
  readonly contract: Contract;
  readonly handlers: (state: Readonly<State>) => ChannelHandlers<Contract>;
}

/** One static Agent protocol with handlers bound from one Agent state. */
export interface AgentChannelDefinition<
  State extends object = object,
  Contract extends ChannelContract = ChannelContract,
> {
  readonly contract: Contract;
  readonly handlers: (state: Readonly<State>) => ChannelHandlers<Contract>;
}

interface StateBoundChannelDefinition<State extends object> {
  readonly contract: ChannelContract;
  readonly handlers: (state: Readonly<State>) => object;
}

/** Independent Workspace contribution factories over completed Workspace state. */
export interface WorkspaceFacetFactories<State extends object = object> {
  readonly resources?: (
    state: Readonly<State>,
  ) => readonly ResourceContribution[];
  readonly channels?: ReadonlyArray<StateBoundChannelDefinition<State>>;
  /** Surface entry files resolved against the feature entry directory. */
  readonly surfaces?: (state: Readonly<State>) => readonly string[];
}

/** Independent Agent contribution factories over one completed Agent state. */
export interface AgentFacetFactories<State extends object = object> {
  readonly tools?: (state: Readonly<State>) => readonly AgentToolContribution[];
  readonly systemPrompt?: (
    state: Readonly<State>,
  ) => AgentSystemPromptContribution;
  readonly skills?: (
    state: Readonly<State>,
  ) => readonly AgentSkillContribution[];
  readonly turnState?: (state: Readonly<State>) => TurnStateContributions;
  /** Model-visible projection of this viewpoint-local Agent feature state. */
  readonly modelContext?: (
    state: Readonly<State>,
  ) => readonly AgentContextContribution[];
  readonly channels?: ReadonlyArray<StateBoundChannelDefinition<State>>;
}

/** Runtime-erased grouped feature definition consumed after source loading. */
export interface FeatureDefinition {
  readonly id: string;
  readonly settings?: SettingsDefinition;
  readonly workspaceState?: WorkspaceFeatureStateFactory;
  readonly agentState?: AgentFeatureStateFactory;
  readonly workspace?: WorkspaceFacetFactories;
  readonly agent?: AgentFacetFactories;
}

type CompletedWorkspaceState<
  Settings extends SettingsDefinition | undefined,
  Built extends WorkspaceFeatureStateBuilder<object> | undefined,
> =
  Built extends WorkspaceFeatureStateBuilder<object>
    ? FeatureStateOf<Built>
    : Readonly<WorkspaceFeatureStateBase<Settings>>;

type CompletedAgentState<
  Settings extends SettingsDefinition | undefined,
  Built extends AgentFeatureStateBuilder<object> | undefined,
> =
  Built extends AgentFeatureStateBuilder<object>
    ? FeatureStateOf<Built>
    : Readonly<AgentFeatureStateBase<Settings>>;

interface AuthoredFeatureDefinition<
  Settings extends SettingsDefinition | undefined,
  WorkspaceBuilt extends WorkspaceFeatureStateBuilder<object> | undefined,
  AgentBuilt extends AgentFeatureStateBuilder<object> | undefined,
> {
  readonly id: string;
  readonly settings?: Settings;
  readonly workspaceState?: (
    state: WorkspaceFeatureStateBuilder<WorkspaceFeatureStateBase<Settings>>,
  ) => Exclude<WorkspaceBuilt, undefined>;
  readonly agentState?: (
    state: AgentFeatureStateBuilder<AgentFeatureStateBase<Settings>>,
  ) => Exclude<AgentBuilt, undefined>;
  readonly workspace?: WorkspaceFacetFactories<
    CompletedWorkspaceState<Settings, WorkspaceBuilt>
  >;
  readonly agent?: AgentFacetFactories<
    CompletedAgentState<Settings, AgentBuilt>
  >;
}

/**
 * Preserve settings and state-builder inference across grouped contribution
 * factories. Runtime loading consumes the erased {@link FeatureDefinition}.
 */
export function defineFeature<
  const Settings extends SettingsDefinition | undefined = undefined,
  WorkspaceBuilt extends WorkspaceFeatureStateBuilder<object> | undefined =
    undefined,
  AgentBuilt extends AgentFeatureStateBuilder<object> | undefined = undefined,
>(
  definition: AuthoredFeatureDefinition<Settings, WorkspaceBuilt, AgentBuilt>,
): FeatureDefinition {
  return definition as unknown as FeatureDefinition;
}
