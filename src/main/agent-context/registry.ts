// state messages: the cockpit→agent state pathway.
//
// A agent-context contribution declares one model-visible state section: its
// canonical id, vocabulary line, optional UIX-managed buffer, and optional
// materializer. The registered object is the contribution; registrations may
// return a capability handle when the substrate manages a buffer for the owner.
//
// Buffer semantics are intentionally small:
//   - update: owner calls update(payload); UIX retains the latest value and
//     flushes only when the post-materialized body differs from the nearest
//     persisted body on the branch.
//   - append: owner calls append(payload); UIX queues values, flushes the
//     pending list, and clears only after the branch confirms persistence.
//   - no buffer: owner supplies materialize(); UIX calls it while preparing an
//     agent run, and the contribution owns any external state it reads or
//     consumes.
//
// All flushed sections are coalesced into one display-hidden `uix.state` custom
// message. Pi renders custom messages into provider user-role text and strips
// customType, so the content itself carries a <uix-state> envelope and one
// inner tag per canonical id. Human prompt text stays verbatim.

import type {
  SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

import { toContributionId, type ContributionId } from "#shared/contribution-id";
import { DisposableBag } from "../lifecycle";
import {
  createTurnStateHistoryReader,
  type TurnStateHistoryReader,
} from "../turn-state/registry";

import type { AgentInstaller } from "../agent/installers";

// ---- canonical id brand ----

const AgentContextCanonicalIdBrand: unique symbol = Symbol(
  "AgentContextCanonicalId",
);

export type AgentContextCanonicalId = string & {
  readonly [AgentContextCanonicalIdBrand]: true;
};

/**
 * Builds the canonical id for a agent-context contribution:
 * `${featureId}.${name}` (e.g. `canvas.pane-visibility`).
 * Validates each segment; a failure is an app bug.
 */
function toAgentContextCanonicalId(
  featureId: string,
  name: string,
): AgentContextCanonicalId {
  assertAgentContextToken("feature id", featureId);
  assertAgentContextToken("state message name", name);
  return `${featureId}.${name}` as AgentContextCanonicalId;
}

function assertAgentContextToken(label: string, token: string): void {
  const pattern = /^[a-z][a-z0-9_-]*$/;
  if (!pattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${pattern}.`);
  }
}

export interface AgentContextMaterialization {
  /** Body rendered inside this contribution's state tag; this is what the model sees. */
  content: string;
  /** Optional structured sidecar persisted with the combined custom message. */
  details?: unknown;
}

// Agent-context materializers run after turn-state prep has appended its
// durable refs, so turnState() resolves to the latest committed state for this
// feature.  Really the only reason we have this type alias is to make it clear
// that we are in a particular stage in the execution and so the expectations
// of what the "previous state" is clearer.
export type AgentContextMaterializationContext = TurnStateHistoryReader;

type MaybePromise<T> = T | Promise<T>;

interface BaseContribution {
  // We use the name mostly just to derive the contributionID and canonicalID
  // by the substrate
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

export function registerAgentContextContributions(
  agentContext: AgentContextRegistry,
  featureId: string,
  contributions: readonly AgentContextContribution[],
): Disposable {
  const bag = new DisposableBag();

  for (const contribution of contributions) {
    if (isUpdateContribution(contribution)) {
      const handle = agentContext.register(featureId, contribution);
      if (contribution.initialValue !== undefined) {
        handle.update(contribution.initialValue);
      }
      bag.add(handle);
      continue;
    }

    if (isAppendContribution(contribution)) {
      bag.add(agentContext.register(featureId, contribution));
      continue;
    }

    bag.add(agentContext.register(featureId, contribution));
  }

  return bag;
}

function isUpdateContribution(
  contribution: AgentContextContribution,
): contribution is UpdateContribution<TSchema> {
  return contribution.buffer?.kind === "update";
}

function isAppendContribution(
  contribution: AgentContextContribution,
): contribution is AppendContribution<TSchema> {
  return contribution.buffer?.kind === "append";
}

type RegisteredContribution =
  | RegisteredUpdateContribution
  | RegisteredAppendContribution
  | RegisteredMaterializedContribution;

interface RegisteredContributionBase {
  featureId: string;
  contributionId: ContributionId;
  canonicalId: AgentContextCanonicalId;
  description: string;
}

interface RegisteredUpdateContribution extends RegisteredContributionBase {
  kind: "update";
  schema: TSchema;
  materialize?: (input: {
    value: unknown;
  }) => MaybePromise<AgentContextMaterialization | undefined>;
  hasValue: boolean;
  value?: unknown;
}

interface RegisteredAppendContribution extends RegisteredContributionBase {
  kind: "append";
  schema: TSchema;
  materialize?: (input: {
    values: readonly unknown[];
  }) => MaybePromise<AgentContextMaterialization | undefined>;
  values: unknown[];
  inFlight?: { content: string; count: number };
}

interface RegisteredMaterializedContribution extends RegisteredContributionBase {
  kind: "materialized";
  materialize: (
    ctx: AgentContextMaterializationContext,
  ) => MaybePromise<AgentContextMaterialization | undefined>;
}

/** Registry for agent-context contributions. Features pass this to `registerAgentContextContributions`; they never call individual registration methods directly. */
export class AgentContextRegistry {
  readonly registeredContributions: RegisteredContribution[] = [];

  register<T extends TSchema>(
    featureId: string,
    contribution: UpdateContribution<T>,
  ): AgentContextUpdater<T>;
  register<T extends TSchema>(
    featureId: string,
    contribution: AppendContribution<T>,
  ): AgentContextAppender<T>;
  register(
    featureId: string,
    contribution: MaterializedContribution,
  ): Disposable;
  register(
    featureId: string,
    contribution:
      | UpdateContribution<TSchema>
      | AppendContribution<TSchema>
      | MaterializedContribution,
  ): AgentContextUpdater<TSchema> | AgentContextAppender<TSchema> | Disposable {
    const canonicalId = toAgentContextCanonicalId(featureId, contribution.name);
    const contributionId = toContributionId(
      featureId,
      "agent-context",
      contribution.name,
    );

    if (
      this.registeredContributions.some((e) => e.canonicalId === canonicalId)
    ) {
      throw new Error(`Agent context already registered: ${canonicalId}`);
    }

    const registeredContribution = toRegisteredContribution(
      featureId,
      canonicalId,
      contributionId,
      contribution,
    );
    this.registeredContributions.push(registeredContribution);

    const dispose = (): void => {
      const index = this.registeredContributions.indexOf(
        registeredContribution,
      );
      if (index !== -1) this.registeredContributions.splice(index, 1);
    };

    if (registeredContribution.kind === "update") {
      return {
        update: (payload: unknown): void => {
          assertPayloadMatchesSchema(registeredContribution, payload);
          registeredContribution.hasValue = true;
          registeredContribution.value = payload;
        },
        [Symbol.dispose]: dispose,
      };
    }

    if (registeredContribution.kind === "append") {
      return {
        append: (payload: unknown): void => {
          assertPayloadMatchesSchema(registeredContribution, payload);
          registeredContribution.values.push(payload);
        },
        [Symbol.dispose]: dispose,
      };
    }

    return { [Symbol.dispose]: dispose };
  }
}

export interface AgentContextMessage {
  content: string;
  details?: Record<string, unknown>;
}

/**
 * Install the system-prompt vocabulary section for agent-context contributions.
 * The message flush is handled by the driver (see buildAgentContextMessage) so
 * the uix.state entry is ordered before the user message in the session tree.
 */
export function createAgentContextVocabularyInstaller(
  stateMessageRegistry: AgentContextRegistry,
): AgentInstaller {
  return (pi) => {
    const installedContributions = [
      ...stateMessageRegistry.registeredContributions,
    ];
    const vocabulary = installedContributions.length
      ? vocabularySection(
          installedContributions.map((contribution) => ({
            canonicalId: contribution.canonicalId,
            description: contribution.description,
          })),
        )
      : undefined;

    if (!vocabulary) return;

    pi.on("before_agent_start", async (event, _ctx) => ({
      systemPrompt: `${event.systemPrompt}\n\n${vocabulary}`,
    }));
  };
}

/**
 * Build the display-hidden uix.state message from all live agent-context
 * contributions. Called by the driver before session.prompt(text) so the
 * entry is ordered before the user message in the session tree.
 *
 * Returns undefined when no sections would be emitted (nothing to flush).
 */
export async function buildAgentContextMessage(
  sessionManager: SessionManager,
  registry: AgentContextRegistry,
): Promise<AgentContextMessage | undefined> {
  const liveContributions = registry.registeredContributions;
  if (liveContributions.length === 0) return undefined;

  const bufferedContributions = liveContributions.filter(
    (c) => c.kind === "update" || c.kind === "append",
  );
  const lastBodies = nearestPersistedBodies(
    sessionManager.getBranch(),
    bufferedContributions.map((contribution) => contribution.canonicalId),
  );

  for (const contribution of bufferedContributions) {
    reconcileAppendPersistence(
      contribution,
      lastBodies.get(contribution.canonicalId),
    );
  }

  const sections: string[] = [];
  let details: Record<string, unknown> | undefined;

  for (const contribution of liveContributions) {
    const message = await materializeContribution(
      contribution,
      sessionManager.getBranch(),
    );
    if (message === undefined) continue;

    if (
      contribution.kind === "update" &&
      message.content === lastBodies.get(contribution.canonicalId)
    ) {
      continue;
    }

    if (contribution.kind === "append") {
      contribution.inFlight = {
        content: message.content,
        count: contribution.values.length,
      };
    }

    sections.push(renderSection(contribution.canonicalId, message.content));
    if (message.details !== undefined) {
      (details ??= {})[contribution.canonicalId] = message.details;
    }
  }

  if (sections.length === 0) return undefined;

  return {
    content: ["<uix-state>", ...sections, "</uix-state>"].join("\n"),
    details,
  };
}

function toRegisteredContribution(
  featureId: string,
  canonicalId: AgentContextCanonicalId,
  contributionId: ContributionId,
  contribution:
    | UpdateContribution<TSchema>
    | AppendContribution<TSchema>
    | MaterializedContribution,
): RegisteredContribution {
  if (contribution.buffer?.kind === "update") {
    return {
      kind: "update",
      featureId,
      contributionId: contributionId,
      canonicalId,
      description: contribution.description,
      schema: contribution.buffer.schema,
      materialize:
        contribution.materialize as RegisteredUpdateContribution["materialize"],
      hasValue: false,
    };
  }

  if (contribution.buffer?.kind === "append") {
    return {
      kind: "append",
      featureId,
      contributionId: contributionId,
      canonicalId,
      description: contribution.description,
      schema: contribution.buffer.schema,
      materialize:
        contribution.materialize as RegisteredAppendContribution["materialize"],
      values: [],
    };
  }

  const materialized = contribution as MaterializedContribution;
  return {
    kind: "materialized",
    featureId,
    contributionId: contributionId,
    canonicalId,
    description: materialized.description,
    materialize: materialized.materialize,
  };
}

function assertPayloadMatchesSchema(
  contribution: RegisteredUpdateContribution | RegisteredAppendContribution,
  payload: unknown,
): void {
  if (!Value.Check(contribution.schema, payload)) {
    const [first] = Value.Errors(contribution.schema, payload);
    throw new Error(
      `Invalid ${contribution.canonicalId} payload: ${first?.message ?? "schema mismatch"}`,
    );
  }
}

async function materializeContribution(
  contribution: RegisteredContribution,
  branch: readonly SessionEntry[],
): Promise<AgentContextMaterialization | undefined> {
  if (contribution.kind === "update") {
    if (!contribution.hasValue) return undefined;
    return contribution.materialize
      ? contribution.materialize({ value: contribution.value })
      : defaultMaterialization(contribution.value);
  }

  if (contribution.kind === "append") {
    if (contribution.values.length === 0) return undefined;
    return contribution.materialize
      ? contribution.materialize({ values: contribution.values })
      : defaultMaterialization(contribution.values);
  }

  return contribution.materialize(
    createTurnStateHistoryReader(branch, contribution.featureId),
  );
}

function defaultMaterialization(value: unknown): AgentContextMaterialization {
  return { content: JSON.stringify(value), details: value };
}

function reconcileAppendPersistence(
  contribution: RegisteredUpdateContribution | RegisteredAppendContribution,
  lastBody: string | undefined,
): void {
  if (contribution.kind !== "append") return;
  if (!contribution.inFlight) return;
  if (contribution.inFlight.content !== lastBody) return;
  contribution.values.splice(0, contribution.inFlight.count);
  contribution.inFlight = undefined;
}

function renderSection(
  canonicalId: AgentContextCanonicalId,
  body: string,
): string {
  return [`<${canonicalId}>`, body, `</${canonicalId}>`].join("\n");
}

function vocabularySection(
  configs: readonly Pick<
    RegisteredContributionBase,
    "canonicalId" | "description"
  >[],
): string {
  return [
    "## UIX cockpit state messages",
    "",
    "UIX (the cockpit hosting this session) injects state updates as context",
    "messages alongside the user's message. The human did not write them.",
    "State arrives in a single <uix-state> block containing one tagged",
    "section per update:",
    "",
    ...configs.map(
      (config) => `- \`<${config.canonicalId}>\` — ${config.description}`,
    ),
  ].join("\n");
}

function nearestPersistedBodies(
  entries: readonly SessionEntry[],
  canonicalIds: readonly AgentContextCanonicalId[],
): Map<AgentContextCanonicalId, string> {
  const found = new Map<AgentContextCanonicalId, string>();
  if (canonicalIds.length === 0) return found;
  const want = new Set(canonicalIds);
  for (let i = entries.length - 1; i >= 0 && want.size > 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom_message") continue;
    if (entry.customType !== "uix.state") continue;
    if (typeof entry.content !== "string") continue;
    for (const canonicalId of [...want]) {
      const open = `<${canonicalId}>\n`;
      const close = `\n</${canonicalId}>`;
      const start = entry.content.indexOf(open);
      if (start === -1) continue;
      const end = entry.content.indexOf(close, start + open.length);
      if (end === -1) continue;
      found.set(canonicalId, entry.content.slice(start + open.length, end));
      want.delete(canonicalId);
    }
  }
  return found;
}
