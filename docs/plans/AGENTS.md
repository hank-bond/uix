---
summary: "Active build specs for what's about to be built — deliverables and their units — plus a backlog of seeds not yet promoted to their own spec."
status: active
---

# Plans

Specs for things we intend to build — slugged by deliverable. A plan only needs to be **valid**, not actively worked. Shipped plans move to [`archive/`](./archive/). Plans cite the [`../decisions/`](../decisions/) they assume and the [`../design/`](../design/) thread they came from.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs — do not edit by hand; run `npm run docs:index`. -->

- **[backlog](./backlog.md)** _(active)_ — Compact seeds for planned UIX deliverables that need enough context to be actionable but aren't standalone specs yet.
- **[canvas-anchored-edit-channel](./canvas-anchored-edit-channel.md)** _(active)_ — Build spec for the value-first canvas anchored edit channel: the anchor pool (P0), the anchored editing core (U1), and the live bidirectional canvas channel (U2) on customTools — later units (pi refactor, FS parity, versioning) are out of scope here.
- **[contribution-id-derivation](./contribution-id-derivation.md)** _(active)_ — Derive contribution/canonical ids from featureId + name across all facets so authors give only a local name; one uniform ContributionId brand (`${featureId}.<facet>.<name>`) plus one per-facet canonical-id brand (facet segment dropped), the api exposes author shapes only. Units: channels (done), agent tools (done), state messages (done), resources, private state.
- **[durable-transcript-identity](./durable-transcript-identity.md)** _(active)_ — Build keyed-on-persist transcript identity: main observes pi session appends (D0), items go pre-key→keyed with one in-place rekey and born-keyed tool rows (D1), durable block state rides uix.* custom entries written by main with pre-key effects queued (D2), and one branch-walk rehydrator joins state for replay and every uix.* consumer (D3).
- **[persistence-and-session-foundation](./persistence-and-session-foundation.md)** _(active)_ — Build spec for persistence on pi's session file: file-backed session + history rehydration (C0), the in-process pi extension (C1), and the first versioned-store + central state-coordinator contribution state (C2/C3) are landing; the state-message substrate is transitional, and the next step is the symmetric contribution contract — preview/restore callbacks beside prepare — which generalizes turn-state to contribution-keyed opaque state and folds anchor rehydration (C4) into canvas restore (C5).
- **[workspace-runtime-foundation](./workspace-runtime-foundation.md)** _(active)_ — Build the Host→Workspace runtime boundary before surface contributions: introduce a web-compatible Workspace iframe, bridge it to backend substrate through request/event channels, then move chat and canvas in as default feature surfaces without hardcoding them in Host. _Read when resuming canvas/chat featurification after the Host/Workspace design discussion, especially before adding renderer surface contributions or changing App.tsx._

<!-- INDEX:END -->
