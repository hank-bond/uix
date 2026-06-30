// state messages: the cockpit→agent state pathway.
//
// A state-message contribution declares one model-visible state section: its
// messageType, vocabulary line, optional UIX-managed buffer, and optional
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
// inner tag per messageType. Human prompt text stays verbatim.

import type {
  BeforeAgentStartEventResult,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

import { toContributionId, type ContributionId } from "#shared/contribution-id";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";

import type { AgentInstaller } from "../agent/installers";

// ---- canonical id brand ----

const StateMessageCanonicalIdBrand: unique symbol = Symbol(
  "StateMessageCanonicalId",
);

export type StateMessageCanonicalId = string & {
  readonly [StateMessageCanonicalIdBrand]: true;
};

/**
 * Builds the canonical id for a state-message contribution:
 * `${featureId}.${name}` (e.g. `canvas.pane-visibility`).
 * Validates each segment; a failure is an app bug.
 */
function toStateMessageCanonicalId(
  featureId: string,
  name: string,
): StateMessageCanonicalId {
  assertStateMessageToken("feature id", featureId);
  assertStateMessageToken("state message name", name);
  return `${featureId}.${name}` as StateMessageCanonicalId;
}

function assertStateMessageToken(label: string, token: string): void {
  const pattern = /^[a-z][a-z0-9_-]*$/;
  if (!pattern.test(token)) {
    throw new Error(`Invalid ${label}: ${token}. Expected ${pattern}.`);
  }
}

export interface StateMessageMaterialization {
  /** Body rendered inside this contribution's state tag; this is what the model sees. */
  content: string;
  /** Optional structured sidecar persisted with the combined custom message. */
  details?: unknown;
}

type MaybePromise<T> = T | Promise<T>;

interface BaseContribution {
  /** Local name for this state-message section; the substrate derives the canonical id as `${featureId}.${name}`. */
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
  }) => MaybePromise<StateMessageMaterialization | undefined>;
}

export interface AppendContribution<
  T extends TSchema,
> extends BaseContribution {
  buffer: AppendBuffer<T>;
  /** Optional formatter; default is JSON.stringify(values) with values as details. */
  materialize?: (input: {
    values: readonly Static<T>[];
  }) => MaybePromise<StateMessageMaterialization | undefined>;
}

export interface MaterializedContribution extends BaseContribution {
  buffer?: never;
  /** Called while UIX prepares an agent run; owns any external state it touches. */
  materialize: () => MaybePromise<StateMessageMaterialization | undefined>;
}

export type StateMessageContribution =
  | UpdateContribution<TSchema>
  | AppendContribution<TSchema>
  | MaterializedContribution;

export interface StateMessageUpdater<T extends TSchema> extends Disposable {
  update(payload: Static<T>): void;
}

export interface StateMessageAppender<T extends TSchema> extends Disposable {
  append(payload: Static<T>): void;
}

export function registerStateMessageContributions(
  stateMessages: StateMessageRegistry,
  featureId: string,
  contributions: readonly StateMessageContribution[],
): Disposable {
  const bag = new DisposableBag();

  for (const contribution of contributions) {
    if (isUpdateContribution(contribution)) {
      const handle = stateMessages.register(featureId, contribution);
      if (contribution.initialValue !== undefined) {
        handle.update(contribution.initialValue);
      }
      bag.add(handle);
      continue;
    }

    if (isAppendContribution(contribution)) {
      bag.add(stateMessages.register(featureId, contribution));
      continue;
    }

    bag.add(stateMessages.register(featureId, contribution));
  }

  return bag;
}

function isUpdateContribution(
  contribution: StateMessageContribution,
): contribution is UpdateContribution<TSchema> {
  return contribution.buffer?.kind === "update";
}

function isAppendContribution(
  contribution: StateMessageContribution,
): contribution is AppendContribution<TSchema> {
  return contribution.buffer?.kind === "append";
}

type RegisteredContribution =
  | RegisteredUpdateContribution
  | RegisteredAppendContribution
  | RegisteredMaterializedContribution;

interface RegisteredContributionBase {
  contributionId: ContributionId;
  messageType: string;
  description: string;
}

interface RegisteredUpdateContribution extends RegisteredContributionBase {
  kind: "update";
  schema: TSchema;
  materialize?: (input: {
    value: unknown;
  }) => MaybePromise<StateMessageMaterialization | undefined>;
  hasValue: boolean;
  value?: unknown;
}

interface RegisteredAppendContribution extends RegisteredContributionBase {
  kind: "append";
  schema: TSchema;
  materialize?: (input: {
    values: readonly unknown[];
  }) => MaybePromise<StateMessageMaterialization | undefined>;
  values: unknown[];
  inFlight?: { content: string; count: number };
}

interface RegisteredMaterializedContribution extends RegisteredContributionBase {
  kind: "materialized";
  materialize: () => MaybePromise<StateMessageMaterialization | undefined>;
}

/** Registry for state-message contributions. Features pass this to `registerStateMessageContributions`; they never call individual registration methods directly. */
export class StateMessageRegistry {
  readonly registeredContributions: RegisteredContribution[] = [];

  register<T extends TSchema>(
    featureId: string,
    contribution: UpdateContribution<T>,
  ): StateMessageUpdater<T>;
  register<T extends TSchema>(
    featureId: string,
    contribution: AppendContribution<T>,
  ): StateMessageAppender<T>;
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
  ): StateMessageUpdater<TSchema> | StateMessageAppender<TSchema> | Disposable {
    const canonicalId = toStateMessageCanonicalId(featureId, contribution.name);
    const contributionId = toContributionId(
      featureId,
      "state-message",
      contribution.name,
    );

    if (
      this.registeredContributions.some(
        (e) => e.messageType === (canonicalId as string),
      )
    ) {
      throw new Error(`State message already registered: ${canonicalId}`);
    }

    const registeredContribution = toRegisteredContribution(
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

export function createStateMessageAssembler(
  stateMessageRegistry: StateMessageRegistry,
): AgentInstaller {
  return (pi) => {
    const installedContributions = [
      ...stateMessageRegistry.registeredContributions,
    ];
    const vocabulary = installedContributions.length
      ? vocabularySection(
          installedContributions.map((contribution) => ({
            messageType: contribution.messageType,
            description: contribution.description,
          })),
        )
      : undefined;

    pi.on(
      "before_agent_start",
      async (event, ctx): Promise<BeforeAgentStartEventResult> => {
        if (installedContributions.length === 0) return {};

        const result: BeforeAgentStartEventResult = {
          systemPrompt: `${event.systemPrompt}\n\n${vocabulary}`,
        };

        const liveContributions = installedContributions.filter(
          (contribution) =>
            stateMessageRegistry.registeredContributions.includes(contribution),
        );
        const bufferedContributions = liveContributions.filter(
          (
            contribution,
          ): contribution is
            | RegisteredUpdateContribution
            | RegisteredAppendContribution =>
            contribution.kind === "update" || contribution.kind === "append",
        );
        const lastBodies = nearestPersistedBodies(
          ctx.sessionManager.getBranch(),
          bufferedContributions.map((contribution) => contribution.messageType),
        );

        for (const contribution of bufferedContributions) {
          reconcileAppendPersistence(
            contribution,
            lastBodies.get(contribution.messageType),
          );
        }

        const sections: string[] = [];
        let details: Record<string, unknown> | undefined;

        for (const contribution of liveContributions) {
          const message = await materializeContribution(contribution);
          if (message === undefined) continue;

          if (
            contribution.kind === "update" &&
            message.content === lastBodies.get(contribution.messageType)
          ) {
            continue;
          }

          if (contribution.kind === "append") {
            contribution.inFlight = {
              content: message.content,
              count: contribution.values.length,
            };
          }

          sections.push(
            renderSection(contribution.messageType, message.content),
          );
          if (message.details !== undefined) {
            (details ??= {})[contribution.messageType] = message.details;
          }
        }

        if (sections.length > 0) {
          createLogger("agent").debug(
            { sections: sections.length },
            "state_message_flush",
          );
          result.message = {
            customType: "uix.state",
            content: ["<uix-state>", ...sections, "</uix-state>"].join("\n"),
            details,
            display: false,
          };
        }

        return result;
      },
    );
  };
}

function toRegisteredContribution(
  canonicalId: StateMessageCanonicalId,
  contributionId: ContributionId,
  contribution:
    | UpdateContribution<TSchema>
    | AppendContribution<TSchema>
    | MaterializedContribution,
): RegisteredContribution {
  if (contribution.buffer?.kind === "update") {
    return {
      kind: "update",
      contributionId: contributionId,
      messageType: canonicalId,
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
      contributionId: contributionId,
      messageType: canonicalId,
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
    contributionId: contributionId,
    messageType: canonicalId,
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
      `Invalid ${contribution.messageType} payload: ${first?.message ?? "schema mismatch"}`,
    );
  }
}

async function materializeContribution(
  contribution: RegisteredContribution,
): Promise<StateMessageMaterialization | undefined> {
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

  return contribution.materialize();
}

function defaultMaterialization(value: unknown): StateMessageMaterialization {
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

function stateTag(messageType: string): string {
  return messageType.replaceAll(".", "-");
}

function renderSection(messageType: string, body: string): string {
  const tag = stateTag(messageType);
  return [`<${tag}>`, body, `</${tag}>`].join("\n");
}

function vocabularySection(
  configs: readonly Pick<
    RegisteredContributionBase,
    "messageType" | "description"
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
      (config) =>
        `- \`<${stateTag(config.messageType)}>\` — ${config.description}`,
    ),
  ].join("\n");
}

function nearestPersistedBodies(
  entries: readonly SessionEntry[],
  messageTypes: readonly string[],
): Map<string, string> {
  const found = new Map<string, string>();
  if (messageTypes.length === 0) return found;
  const want = new Set(messageTypes);
  for (let i = entries.length - 1; i >= 0 && want.size > 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom_message") continue;
    if (entry.customType !== "uix.state") continue;
    if (typeof entry.content !== "string") continue;
    for (const messageType of [...want]) {
      const open = `<${stateTag(messageType)}>\n`;
      const close = `\n</${stateTag(messageType)}>`;
      const start = entry.content.indexOf(open);
      if (start === -1) continue;
      const end = entry.content.indexOf(close, start + open.length);
      if (end === -1) continue;
      found.set(messageType, entry.content.slice(start + open.length, end));
      want.delete(messageType);
    }
  }
  return found;
}
