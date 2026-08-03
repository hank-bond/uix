---
summary: "Features supply stable prompt sections, Pi skills, branch-scoped turn state, and hidden model-visible agent context through separate contribution facets."
kind: reference
status: active
---

# Agent guidance and context

Feature guidance uses separate mechanisms for stable semantics, task-specific instruction, branch state, and run-time model context. Do not place changing state in static guidance.

## System-prompt sections

`agentSystemPrompt` contributes one stable Markdown section per feature. UIX assembles active sections in manifest order when the Pi runtime starts or reloads.

The assembled suffix also contains generated vocabulary for active agent-context sections. Each run appends the captured suffix to Pi's base system prompt.

Use a prompt section for short semantics that the agent must always know. Tool descriptions remain mechanical invocation contracts.

## Pi skills

`agentSkills` contributes skill files or directories relative to the feature entry. One UIX-owned `resources_discover` handler supplies the resolved paths to Pi.

Pi owns skill validation, compact catalog formatting, and on-demand `SKILL.md` loading. UIX does not parse skill content.

Use a skill for larger task-specific workflows. A matching task can load the complete guidance without paying its context cost on every turn.

## Turn state

Turn-state contributions define named TypeBox-bound cells. A cell creates one complete JSON snapshot and restores a selected-branch value or `undefined`.

The substrate derives ids such as `canvas.documents`. It validates each snapshot and commits only cells whose complete value changed.

Restoration runs on startup, replacement-session activation, and serialized feature reload. Passing `undefined` requires the feature to replace prior working state with defaults.

Turn state is model-invisible branch state. Store stable references rather than large payloads when an owned store can resolve those references.

## Agent context

Agent context carries changing model-visible information without rewriting the human prompt. Each contribution has a feature-local name and optional buffer semantics.

The substrate derives a canonical id such as `canvas.canvas-diff`. That id is both the deduplication key and the inner section tag.

An update buffer carries a TypeBox schema and returns an `AgentContextUpdater`. Calling `update(payload)` retains only the latest validated value.

The assembler sends an update only when its materialized body differs from the nearest persisted section on the branch. Update buffers do not drain.

An append buffer returns an `AgentContextAppender`. Calling `append(payload)` adds a validated value to an ordered pending list.

The assembler clears a confirmed append batch only after branch persistence proves that exact materialized body was written.

A contribution without a buffer supplies `materialize()`. This path reads feature-owned live state while UIX prepares an agent run.

Default buffered materialization uses JSON. A contribution may provide custom materialization for another stable model-facing format.

## Combined message

One agent-context assembler processes every active contribution. When at least one section flushes, it emits one hidden `uix.state` custom message.

The message contains one `<uix-state>` envelope and one canonical inner tag per section. Pi strips `customType` from model context, so text carries section identity.

The message uses `display: false`. Chat hides it, while the model receives its content. Structured sidecar data can remain in `details`.

Feature code never registers directly with the registry. The feature contribution path owns ids, lifetime enrollment, buffer capabilities, and disposal.

## Canvas example

Canvas combines all four mechanisms:

- Its system-prompt section states the persisted interaction and `data-uix-prompt` contracts.
- Its `canvas-authoring` skill contains detailed interactive HTML guidance.
- Its `canvas.documents` turn-state cell stores document snapshot references.
- Its `canvas-diff` agent context derives anchored human-edit hunks from turn-state history.

Canvas no longer sends an ambient list of viewed documents. Document updates already identify their resource, while presentation provenance belongs to future surface instances.

See [`contributions.md`](./contributions.md) for facet shapes and [`state.md`](./state.md) for durable ownership.
