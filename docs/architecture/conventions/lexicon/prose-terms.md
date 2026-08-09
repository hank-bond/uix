---
summary: "Prose boundaries for comments and documentation: reserved domain nouns, locked meanings, and retired words."
kind: reference
read_when: "Read before writing or reviewing wording in comments, summaries, or docs."
---

# Prose terms

## Reserved terms

A reserved word owns its approved meaning. Other senses of the same word are nonconforming.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `turn` | noun | One user–agent prompt–response exchange. | "agent turn", "turn state" | "Turns read and write tool paths into stable locations" (verb use) |
| `store` | noun | Durable source-of-truth API or implementation. | "the document store" | "Stores each document's current content" (use `persists`) |
| `buffer` | noun | Live, feature-specific working projection over a store. | "canvas document buffer" | "Buffers feature-provided context" (use `accumulates`) |
| `surface` | noun | Contributed UI composition. | "the workspace surface" | "the error surfaces when it fails" (use `appears`) |
| `contract` | noun | The explicit public definition of a feature–substrate boundary: the schema- and type-only surface a feature author declares and the substrate implements. A channel is the request/event form of a contract. | "the agent channel contract", "author contracts that features import" | "durability defines the contract" (use `guarantees`), "contract comments" (use `behavioral comments`) |
| `live` | adjective | Instantiated in the runtime and bound to its current point-in-time state: the in-engine form, as opposed to a declarative definition, a persisted record, or a frozen snapshot. Use `current` for the present item in an immutable linked chain (messages) and `selected`/`active` for session choice and projection. The verb `lives` (reside) is a homograph with a different pronunciation, a separate word not governed here. | "a live session", "live transcript IDs", "live state" | "the live message" for the present message in the immutable transcript chain (use `current`) |
| `channel` | noun | A contract for typed requests, responses, and events exchanged over the substrate transport. | "feature channel requests" | "channels resources into the runtime" (use `routes`) |
| `report` | noun | A collection of information prepared for agent or human consumption, such as an analysis artifact. | "reports, dashboards, and knowledge tools", "a report renderer" | "Myers reports only real changes" (use `returns`), "report diagnostics" (use `expose`) |

## Retired terms

The word is banned in all senses. Use the stated alternative.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Registration` | noun | Retired because it named several lifecycle stages. Use `ResolvedXContribution` for registry-ready input, `RegisteredX` for live registry state, and a capability role for the returned value. | `ResolvedActionContribution`, `RegisteredAction` | `ActionRegistration` |
| `save` | verb | Retired. Use `persist` for durable storage, `defer` for a later time, `protect` for keeping safe. | "Persists each document's current content" | "Saves each document's current content", "save it for later" |
| `verify` | verb | Retired for structural checks. Use `validate`. | "validates the transport scheme and origin host" | "verifies the transport scheme and origin host" |
| `supply` | verb | Retired. Use `provide`. | "provides the resource address" | "supplies the resource address" |
| `carry` | verb | Retired. Name the actual relationship: `includes`, `holds`, or the specific relation. | "the factory return type holds the schema" | "the factory return type carries the schema" |

## Locked meanings

The word stays, with one meaning that cannot drift. A locked row states the prose-usage boundary for a term that also holds a UIX-owned row, which keeps the meaning and code examples.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `assemble` | verb | Prose boundary: do not use `combine`, `join`, `merge`, or `collect` for assembly. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Assembles each feature's system-prompt section in workspace order" | "Collects each feature's system-prompt section and joins them for Pi" |
| `validate` | verb | Apply schema or structural checks. `check` remains for constraint tests. | "validates query with TypeBox" | "checks query with TypeBox" |
| `commit` | verb | Accept validated candidate state into an authority at an explicit boundary. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Commits and restores each feature's private branch state" | "Saves and restores each feature's private branch state" |
| `persist` | verb | Write durable state. The mechanism verb. | "Pi persists the entry" | "Pi saves the entry" |
| `provide` | verb | Actively hand something to a consumer. | "provides the resource address" | "supplies the resource address" |
| `expose` | verb | Make reachable through a public contract. | "jiti's interop proxy exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `emit` | verb | Produce an event. Do not emit values or rows. | "main emits the event" | "emits the authoritative born-keyed row" (use `sends`) |
| `retain` | verb | Hold onto a value or membership across changes. Prefer over `keep` for this sense. | "retains the latest value" | "keeps the latest value" |
| `mirror` | verb | Reflect live external changes or events into an internal view or state, with side effects. The non-pure counterpart to `derive`. | "Mirrors live Pi session events as renderer transcript updates", "mirrors Pi-initiated model changes into status" | "Turns live Pi session events into renderer transcript updates" |
| `rekey` | verb | Replace a live row's temporary transport identity with its durable canonical identity at the persistence boundary. | "Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages" | "Replaces temporary live transcript IDs with durable Pi entry IDs when messages are saved" |
| `Runtime` | noun | Prose boundary: `runtime` names an engine. Attributive use survives only in engine names (the feature runtime, surface runtime, agent runtime, workspace runtime, Pi runtime). A thing of the engine is `live`, the engine's, or the domain word. Say `at execution time`, not `at runtime`. The code vocabulary lives in the [role-terms section](./code-terms.md#uix-owned-role-terms). | "the agent runtime owns Pi services and sessions", "at execution time" | "at runtime", "runtime artifacts" |
