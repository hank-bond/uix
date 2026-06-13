// UIX cockpit — state messages: the cockpit→agent state channel.
//
// The substrate analogue of pi's tool registration, for state flowing *to* the
// agent instead of calls flowing from it. A registration declares one
// customType's whole contract — payload schema, the vocabulary line that
// teaches the model the shape, and the send policy — and the assembler
// installed by `binding` does the per-turn work no registrant should repeat:
// it appends one assembled vocabulary section to the system prompt and flushes
// pending state as `display: false` custom messages (hidden from the chat,
// model-visible as plain user-role context, persisted as entries on the
// branch).
//
// Why this channel and not pi's "input" transform: the transform rewrites the
// text pi persists as the user's message, so cockpit context would sit inside
// the human's own entry — visible in the chat and breaking the renderer's
// optimistic-echo text match. See docs/design/agent-state-messages.md.
//
// Change-only suppression compares against the nearest persisted entry of the
// same customType up the session branch — the branch itself is the latch, so
// restart and branch navigation need no re-seeding.

import type {
  BeforeAgentStartEventResult,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";

import { createLogger } from "../log";

import type { AgentBinding } from "./bindings";

export interface StateMessageRegistration {
  /** Durable entry key. Substrate-owned types use the `uix.` prefix. */
  customType: string;
  /**
   * Vocabulary partial: describes this type's *body* for the assembled
   * system-prompt section; the substrate renders the surrounding `<tag>`
   * bullet and the envelope grammar. (Pi strips customType when building LLM
   * context — the envelope's inner tag is what carries it on the wire.)
   */
  description: string;
  /** Validates `emit` payloads at the boundary; a failure is an app bug. */
  schema?: TSchema;
  /**
   * "change-only" (default): flush the pending payload only when its
   * serialized content differs from the nearest persisted entry of this
   * customType on the branch. "always": flush each emitted payload once.
   */
  policy?: "change-only" | "always";
  /**
   * Compute-at-submit alternative to `emit` — for state that must be read
   * exactly once at the turn boundary (consuming reads, e.g. the canvas
   * human-edit diff). Return undefined to send nothing this turn. Mutually
   * exclusive with `emit` for the same customType; policy does not apply —
   * the callback decides by returning undefined.
   */
  atTurnBoundary?: () =>
    | Promise<TurnBoundaryMessage | undefined>
    | TurnBoundaryMessage
    | undefined;
}

/** A boundary callback's produced message: content plus optional details. */
export interface TurnBoundaryMessage {
  content: string;
  details?: unknown;
}

export interface StateMessages {
  /**
   * Declare a customType's contract. Call during binding setup, before the
   * assembler binding runs — the composition root orders `binding` last.
   */
  register(registration: StateMessageRegistration): void;
  /**
   * Latch the current payload for a registered customType; the assembler
   * flushes the latest value at the next turn boundary. Serialization is
   * JSON.stringify, so emit canonically ordered payloads (sorted arrays,
   * stable key order) or change-only comparison degrades to always-send.
   */
  emit(customType: string, payload: unknown): void;
  /**
   * The agent binding that installs the assembler onto pi. Place it after
   * every registrant in the composition root's binding list.
   */
  binding: AgentBinding;
}

export function createStateMessages(): StateMessages {
  const registrations: StateMessageRegistration[] = [];
  const pending = new Map<string, string>();
  let installed = false;

  function registration(
    customType: string,
  ): StateMessageRegistration | undefined {
    return registrations.find((r) => r.customType === customType);
  }

  return {
    register(reg) {
      if (installed) {
        throw new Error(
          `State message ${reg.customType} registered after the assembler binding ran; order the assembler last in the composition root`,
        );
      }
      if (registration(reg.customType)) {
        throw new Error(`State message already registered: ${reg.customType}`);
      }
      registrations.push(reg);
    },

    emit(customType, payload) {
      const reg = registration(customType);
      if (!reg) throw new Error(`Unregistered state message: ${customType}`);
      if (reg.atTurnBoundary) {
        throw new Error(
          `State message ${customType} computes at the turn boundary; emit is not its channel`,
        );
      }
      if (reg.schema && !Value.Check(reg.schema, payload)) {
        const [first] = Value.Errors(reg.schema, payload);
        throw new Error(
          `Invalid ${customType} payload: ${first?.message ?? "schema mismatch"}`,
        );
      }
      pending.set(customType, JSON.stringify(payload));
    },

    binding: (pi) => {
      installed = true;

      // One handler, one combined message: each registration contributes a
      // tagged section (in registration order) and everything flushed this
      // turn ships inside a single <uix-state> envelope, persisted as one
      // `uix.state` custom entry.
      pi.on(
        "before_agent_start",
        async (event, ctx): Promise<BeforeAgentStartEventResult> => {
          if (registrations.length === 0) return {};
          const result: BeforeAgentStartEventResult = {
            systemPrompt: `${event.systemPrompt}\n\n${vocabularySection(registrations)}`,
          };

          const branch = ctx.sessionManager.getBranch();
          const sections: string[] = [];
          let details: Record<string, unknown> | undefined;
          for (const reg of registrations) {
            const message = reg.atTurnBoundary
              ? await reg.atTurnBoundary()
              : flushPending(reg);
            if (message === undefined) continue;
            // Change-only is for state-shaped payloads, where an identical
            // resend is pointless. Boundary callbacks are event-shaped (and
            // often consuming reads) — suppressing an identical payload would
            // *lose* the event, not delay it — so the callback alone decides,
            // per its contract.
            if (
              !reg.atTurnBoundary &&
              reg.policy !== "always" &&
              message.content === lastPersistedBody(branch, reg.customType)
            ) {
              continue;
            }
            sections.push(renderSection(reg.customType, message.content));
            if (message.details !== undefined) {
              (details ??= {})[reg.customType] = message.details;
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

      function flushPending(
        reg: StateMessageRegistration,
      ): TurnBoundaryMessage | undefined {
        const content = pending.get(reg.customType);
        if (content === undefined) return undefined;
        // "always" sends once per emit, so consume the latch; "change-only"
        // keeps it — the persisted entry suppresses the next flush, and if the
        // run dies before the message persists, the retained latch self-heals
        // by resending on the following turn.
        if (reg.policy === "always") pending.delete(reg.customType);
        return { content };
      }
    },
  };
}

// One wire grammar for all state: a single <uix-state> envelope per turn (an
// obvious boundary saying "cockpit state, not human text") containing one
// tagged section per flushed type, so each closing tag names what is ending.
// Section bodies are freeform per type — JSON for state-shaped payloads, lines
// for anchored text — described by each registration's vocabulary line.
function stateTag(customType: string): string {
  return customType.replace(/^uix\./, "").replaceAll(".", "-");
}

function renderSection(customType: string, body: string): string {
  const tag = stateTag(customType);
  return [`<${tag}>`, body, `</${tag}>`].join("\n");
}

function vocabularySection(
  registrations: readonly StateMessageRegistration[],
): string {
  return [
    "## UIX cockpit state messages",
    "",
    "UIX (the cockpit hosting this session) injects state updates as context",
    "messages alongside the user's message. The human did not write them.",
    "State arrives in a single <uix-state> block containing one tagged",
    "section per update:",
    "",
    ...registrations.map(
      (reg) => `- \`<${stateTag(reg.customType)}>\` — ${reg.description}`,
    ),
  ].join("\n");
}

// Nearest persisted body for a customType's section up the branch: walk
// leaf→root over `uix.state` entries and return the section body from the
// first one that carries this type's tag (later entries without the tag mean
// "unchanged since", so the walk continues past them). Absent or unparseable
// reads as "never reported" — the flush resends, which is safe because state
// messages are idempotent.
function lastPersistedBody(
  entries: readonly SessionEntry[],
  customType: string,
): string | undefined {
  const open = `<${stateTag(customType)}>\n`;
  const close = `\n</${stateTag(customType)}>`;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom_message") continue;
    if (entry.customType !== "uix.state") continue;
    if (typeof entry.content !== "string") continue;
    const start = entry.content.indexOf(open);
    if (start === -1) continue;
    const end = entry.content.indexOf(close, start + open.length);
    if (end === -1) continue;
    return entry.content.slice(start + open.length, end);
  }
  return undefined;
}
