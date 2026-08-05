// feature contribution contract.
//
// FeatureDefinition is the shape a manifest-selected feature entry exports:
// an id, an optional context hook, and a contribute function that returns the
// feature's facet contributions. First-party and workspace modules are
// indistinguishable here. The substrate activates both through the same path.
//
// FeatureContext is the service bag injected by the host into every feature
// at activation time. Features access external state only through this object
// and the typed contribution schemas, never by importing host internals.

import type { AgentContextContribution } from "./agent-context";
import type { AgentSkillContribution } from "./agent-skills";
import type { AgentSystemPromptContribution } from "./agent-system-prompt";
import type {
  AgentToolContribution,
  AgentToolOverrideContribution,
} from "./agent-tools";
import type {
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

export type FeaturePreflightContributions = Record<string, never>;

export interface FeatureContributions {
  resources?: readonly ResourceContribution[];
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
  /**
   * Frontend surface entry files, resolved against the feature entry's
   * directory (absolute paths pass through). Each module must export
   * `surface`, a `defineSurface` result. The workspace mounts them in
   * composition order (manifest order, then declaration order here).
   */
  surfaces?: readonly string[];
}

export interface FeatureDefinition<ContributedContext extends object = object> {
  id: string;
  preflight?: FeaturePreflightContributions;
  /**
   * Feature-scoped settings declared before context construction so the
   * loader can hydrate defaults and validate persisted values before
   * handing `ctx.settings` to `context()` and `contribute()`.
   */
  settings?: SettingsDefinition;
  /**
   * Feature-local context hook. Runs first, before any other contribution,
   * and the substrate guarantees its execution order. The substrate merges
   * its return value onto the FeatureContext and hands it to
   * `contribute` and every facet factory.
   */
  context?: (ctx: FeatureContext) => ContributedContext;
  contribute(ctx: FeatureContext & ContributedContext): FeatureContributions;
}

type AuthoredFeatureContext<Settings extends SettingsDefinition | undefined> =
  Omit<FeatureContext, "settings"> & {
    settings: Settings extends SettingsDefinition
      ? SettingsHandleFrom<Settings>
      : SettingsHandle;
  };

type AuthoredFeatureDefinition<
  Settings extends SettingsDefinition | undefined,
  ContributedContext extends object,
> = Omit<
  FeatureDefinition<ContributedContext>,
  "settings" | "context" | "contribute"
> & {
  settings?: Settings;
  context?: (ctx: AuthoredFeatureContext<Settings>) => ContributedContext;
  contribute(
    ctx: AuthoredFeatureContext<Settings> & ContributedContext,
  ): FeatureContributions;
};

/**
 * Preserve an authored settings schema through the feature's injected context.
 * Runtime loading consumes the erased `FeatureDefinition`. This helper carries
 * only source-level agreement between the definition and its callbacks.
 */
export function defineFeature<
  const Settings extends SettingsDefinition | undefined = undefined,
  ContributedContext extends object = object,
>(
  definition: AuthoredFeatureDefinition<Settings, ContributedContext>,
): FeatureDefinition<ContributedContext> {
  return definition as unknown as FeatureDefinition<ContributedContext>;
}
