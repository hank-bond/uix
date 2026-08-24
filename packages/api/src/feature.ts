// Defines Workspace and per-Agent feature factories and their contribution contracts.
//
// FeatureDefinition is the shape exported by every manifest-selected feature.
// Workspace factories run once per feature activation. Agent factories run once
// per AgentInstance. Callbacks returned by either factory close over values
// created by that factory call.
//
// Feature contexts contain substrate capabilities. Features never import host
// internals. They contain no workspace, attachment, or session routing values.

import type { AgentContextContribution } from "./agent-context";
import type { AgentSkillContribution } from "./agent-skills";
import type { AgentSystemPromptContribution } from "./agent-system-prompt";
import type {
  AgentToolContribution,
  AgentToolOverrideContribution,
} from "./agent-tools";
import type {
  ChannelContract,
  ChannelContribution,
  FeatureEventPublisherFactory,
} from "./channels";
import type { DocumentStoreFactory } from "./documents";
import type { FeatureLogger } from "./log";
import type { ResourceContribution } from "./resources";
import type {
  SettingsDefinition,
  SettingsHandle,
  SettingsHandleFrom,
} from "./settings";
import type { TurnStateContributions } from "./turn-state";

export type { AgentContextContribution } from "./agent-context";
export type { AgentSkillContribution } from "./agent-skills";
export type { AgentSystemPromptContribution } from "./agent-system-prompt";
export type {
  AgentToolContribution,
  AgentToolOverrideContribution,
} from "./agent-tools";
export type { ChannelContribution } from "./channels";
export type { DocumentStoreFactory } from "./documents";
export type { FeatureLogger } from "./log";
export type { ResourceContribution } from "./resources";
export type { SettingsDefinition, SettingsHandle } from "./settings";
export type {
  TurnStateCellDefinition,
  TurnStateContributions,
} from "./turn-state";

export interface FeatureContext {
  documents: DocumentStoreFactory;
  settings: SettingsHandle;
  channels: FeatureEventPublisherFactory;
  /** Feature-id-scoped structured logger bound by the host. */
  log: FeatureLogger;
}

export type WorkspaceFeatureContext = FeatureContext;
export type AgentFeatureContext = FeatureContext;

/** Contributions installed once for one active Workspace feature. */
export interface WorkspaceFeatureContributions {
  resources?: readonly ResourceContribution[];
  /** Workspace-scoped request handlers and event contracts. */
  channels?: readonly ChannelContribution[];
  /** Contracts whose handlers are supplied by each Agent factory. */
  agentChannelContracts?: readonly ChannelContract[];
  /**
   * Frontend surface entry files, resolved against the feature entry's
   * directory (absolute paths pass through). Each module must export
   * `surface`, a `defineSurface` result. The workspace mounts them in
   * composition order (manifest order, then declaration order here).
   */
  surfaces?: readonly string[];
}

/** Contributions installed separately for one AgentInstance. */
export interface AgentFeatureContributions {
  /** Handlers for contracts registered by `agentChannelContracts`. */
  channels?: readonly ChannelContribution[];
  /** Feature-namespaced Pi tools. */
  agentTools?: readonly AgentToolContribution[];
  /** Intentional exact-name Pi tools, including replacements and app vocabulary. */
  agentToolOverrides?: readonly AgentToolOverrideContribution[];
  /** Stable Markdown appended to the agent system prompt while this feature is active. */
  agentSystemPrompt?: AgentSystemPromptContribution;
  /** Pi skill files/directories, resolved relative to the feature entry file. */
  agentSkills?: readonly AgentSkillContribution[];
  turnState?: TurnStateContributions;
  agentContext?: readonly AgentContextContribution[];
}

export type WorkspaceFeatureInstance = WorkspaceFeatureContributions &
  Partial<Disposable & AsyncDisposable>;
export type AgentFeatureInstance = AgentFeatureContributions &
  Partial<Disposable & AsyncDisposable>;

export interface FeatureDefinition {
  id: string;
  /** Feature-scoped settings loaded before either factory runs. */
  settings?: SettingsDefinition;
  /** Runs once per active Workspace feature. */
  workspace?: (ctx: WorkspaceFeatureContext) => WorkspaceFeatureInstance;
  /** Runs once per AgentInstance. */
  agent?: (ctx: AgentFeatureContext) => AgentFeatureInstance;
}

type AuthoredFeatureContext<Settings extends SettingsDefinition | undefined> =
  Omit<FeatureContext, "settings"> & {
    settings: Settings extends SettingsDefinition
      ? SettingsHandleFrom<Settings>
      : SettingsHandle;
  };

type AuthoredFactories<Settings extends SettingsDefinition | undefined> =
  | {
      workspace(
        ctx: AuthoredFeatureContext<Settings>,
      ): WorkspaceFeatureInstance;
      agent?: (ctx: AuthoredFeatureContext<Settings>) => AgentFeatureInstance;
    }
  | {
      workspace?: (
        ctx: AuthoredFeatureContext<Settings>,
      ) => WorkspaceFeatureInstance;
      agent(ctx: AuthoredFeatureContext<Settings>): AgentFeatureInstance;
    };

type AuthoredFeatureDefinition<
  Settings extends SettingsDefinition | undefined,
> = Omit<FeatureDefinition, "settings" | "workspace" | "agent"> & {
  settings?: Settings;
} & AuthoredFactories<Settings>;

/** Preserve an authored settings schema through both feature factories. */
export function defineFeature<
  const Settings extends SettingsDefinition | undefined = undefined,
>(definition: AuthoredFeatureDefinition<Settings>): FeatureDefinition {
  return definition as FeatureDefinition;
}
