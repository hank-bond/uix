// Registers feature context, manages optional buffers, and assembles model-visible state messages against branch history.
//
// An agent-context contribution declares one model-visible state section: its
// canonical id, vocabulary line, optional UIX-managed buffer, and optional
// materializer. Resolution derives owner-scoped ids; registry acceptance adds
// mutable live state only for update and append buffers. The register operation
// returns a capability when the substrate manages a buffer for the owner.
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
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import type {
  AgentContextAppender,
  AgentContextContribution,
  AgentContextMaterialization,
  AgentContextUpdater,
  AppendContribution,
  MaterializedContribution,
  UpdateContribution,
} from "@uix/api/agent-context";

import {
  type AgentContextCanonicalId,
  resolveAgentContextContribution,
  type ResolvedAgentContextAppendContribution,
  type ResolvedAgentContextContributionBase,
  type ResolvedAgentContextMaterializedContribution,
  type ResolvedAgentContextUpdateContribution,
} from "./resolution";
import { DisposableBag } from "../lifecycle";
import { createLogger } from "../log";
import { createTurnStateHistoryReader } from "../turn-state";

const log = createLogger("agent-context");

export function registerAgentContextContributions(
  agentContext: AgentContextRegistry,
  featureId: string,
  contributions: readonly AgentContextContribution[],
): Disposable {
  const bag = new DisposableBag();

  try {
    for (const contribution of contributions) {
      if (isUpdateContribution(contribution)) {
        const handle = bag.add(agentContext.register(featureId, contribution));
        if (contribution.initialValue !== undefined) {
          handle.update(contribution.initialValue);
        }
        continue;
      }

      if (isAppendContribution(contribution)) {
        bag.add(agentContext.register(featureId, contribution));
        continue;
      }

      bag.add(agentContext.register(featureId, contribution));
    }

    return bag;
  } catch (err) {
    bag[Symbol.dispose]();
    throw err;
  }
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

type AgentContextRegistryMember =
  | RegisteredAgentContextUpdateContribution
  | RegisteredAgentContextAppendContribution
  | ResolvedAgentContextMaterializedContribution;

export interface RegisteredAgentContextUpdateContribution extends ResolvedAgentContextUpdateContribution {
  hasValue: boolean;
  value?: unknown;
}

export interface RegisteredAgentContextAppendContribution extends ResolvedAgentContextAppendContribution {
  values: unknown[];
  inFlight?: { content: string; count: number };
}

/** Registry for agent-context contributions. Features pass this to `registerAgentContextContributions`; they never call its register methods directly. */
export class AgentContextRegistry {
  readonly #contributions: AgentContextRegistryMember[] = [];

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
    const resolvedContribution = resolveAgentContextContribution(
      featureId,
      contribution,
    );
    if (
      this.#contributions.some(
        (existing) => existing.canonicalId === resolvedContribution.canonicalId,
      )
    ) {
      throw new Error(
        `Agent context already registered: ${resolvedContribution.canonicalId}`,
      );
    }

    const registryMember =
      resolvedContribution.kind === "materialized"
        ? resolvedContribution
        : createRegisteredBufferedContribution(resolvedContribution);
    this.#contributions.push(registryMember);

    const dispose = (): void => {
      const index = this.#contributions.indexOf(registryMember);
      if (index !== -1) this.#contributions.splice(index, 1);
    };

    if (registryMember.kind === "update") {
      return {
        update: (payload: unknown): void => {
          assertPayloadMatchesSchema(registryMember, payload);
          registryMember.hasValue = true;
          registryMember.value = payload;
        },
        [Symbol.dispose]: dispose,
      };
    }

    if (registryMember.kind === "append") {
      return {
        append: (payload: unknown): void => {
          assertPayloadMatchesSchema(registryMember, payload);
          registryMember.values.push(payload);
        },
        [Symbol.dispose]: dispose,
      };
    }

    return { [Symbol.dispose]: dispose };
  }

  list(): readonly AgentContextRegistryMember[] {
    return this.#contributions;
  }
}

export interface AgentContextMessage {
  content: string;
  details?: Record<string, unknown>;
}

/** Assemble the stable system-prompt vocabulary for registered context tags. */
export function assembleAgentContextVocabularySection(
  registry: AgentContextRegistry,
): string | undefined {
  const contributions = registry.list();
  if (contributions.length === 0) return undefined;
  return vocabularySection(
    contributions.map((contribution) => ({
      canonicalId: contribution.canonicalId,
      description: contribution.description,
    })),
  );
}

/**
 * Assemble the display-hidden uix.state message from all live agent-context
 * contributions. Called by the driver before session.prompt(text) so the
 * entry is ordered before the user message in the session tree.
 *
 * Returns undefined when no sections would be emitted (nothing to flush).
 */
export async function assembleAgentContextMessage(
  sessionManager: SessionManager,
  registry: AgentContextRegistry,
): Promise<AgentContextMessage | undefined> {
  const liveContributions = registry.list();
  if (liveContributions.length === 0) {
    log.debug({}, "no_live_contributions");
    return undefined;
  }

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

  if (sections.length === 0) {
    log.debug({}, "nothing_changed");
    return undefined;
  }

  const content = ["<uix-state>", ...sections, "</uix-state>"].join("\n");
  log.debug({ sections: sections.length, content, details }, "flushed");

  return { content, details };
}

function createRegisteredBufferedContribution(
  contribution:
    | ResolvedAgentContextUpdateContribution
    | ResolvedAgentContextAppendContribution,
):
  | RegisteredAgentContextUpdateContribution
  | RegisteredAgentContextAppendContribution {
  return contribution.kind === "update"
    ? { ...contribution, hasValue: false }
    : { ...contribution, values: [] };
}

function assertPayloadMatchesSchema(
  contribution:
    | RegisteredAgentContextUpdateContribution
    | RegisteredAgentContextAppendContribution,
  payload: unknown,
): void {
  if (!Value.Check(contribution.schema, payload)) {
    const [first] = Value.Errors(contribution.schema, payload);
    throw new Error(
      `Invalid ${contribution.canonicalId} payload: ${first.message}`,
    );
  }
}

async function materializeContribution(
  contribution: AgentContextRegistryMember,
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
  contribution:
    | RegisteredAgentContextUpdateContribution
    | RegisteredAgentContextAppendContribution,
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
  configs: ReadonlyArray<
    Pick<ResolvedAgentContextContributionBase, "canonicalId" | "description">
  >,
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
