---
summary: "Migrate every production source header to the summary-plus-elaboration model with controlled vocabulary, add missing headers and AGENTS.md overviews, and align AGENTS.md summaries."
status: landed
---

# File summary migration

Apply the reserved-word vocabulary and the summary-plus-elaboration header model across the whole repository, then close the gaps the audit found: nonconforming verbs in indexed headers, missing headers in the unindexed boundaries (`src/api`, `src/renderer`, `src/features`), stub summaries, and two `AGENTS.md` summary violations.

Read these three governing docs before editing anything:

- [`lexicon.md`](../../docs/architecture/conventions/lexicon/AGENTS.md) — the controlled vocabulary, its operating rules, and the STE table shape
- [`comments.md`](../../docs/architecture/conventions/comments.md) — the Source-file headers section (summary plus elaboration)
- [`source-organization.md`](../../docs/architecture/conventions/source-organization.md) — the Files express responsibility section (one-responsibility boundary, expressibility and coupling tests, sibling separation)

## Vocabulary cheat sheet

The full tables live in the reserved-words doc; this is the enforcement subset for headers.

| Rule | Conforming | Nonconforming |
| --- | --- | --- |
| `turn` is a noun | "agent turn" | "Turns X into Y" (use `derives`, `mirrors`, or `assembles` per operation) |
| `assemble` for the combine-family | "Assembles the prompt sections" | "Combines", "Joins", "Merges", "Collects" for one artifact |
| `derive` for pure computation | "Derives the transcript items from persisted entries" | "Reads one branch into its transcript" |
| `mirror` for side-effecting reflection | "Mirrors live Pi session events as transcript updates" | "Turns live events into updates" |
| `rekey` at the persistence boundary | "Rekeys temporary IDs to durable entry IDs" | "Replaces temporary IDs with durable IDs" |
| `validate` for schema or structural checks | "Validates workspace manifests" | "Checks workspace manifests" |
| `commit` at an authority boundary | "Commits and restores branch state" | "Saves and restores branch state" |
| `persist` for durable storage | "Persists each document's content" | "Saves", "Stores" (`store` is a noun) |
| `provide` for active delivery | "provides the resource address" | "supplies" |
| `expose` means reachable through a public contract | "exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `emit` means produce an event | "emits the event" | "emits the row" (use `sends`) |
| `retain` over `keep` for the hold-onto sense | "retains the latest value" | "keeps the latest value" |
| `report` is a noun | "reports and dashboards" | "reports diagnostics" (use `expose`); "reports only real changes" (use `returns`) |
| `check` stays for constraint tests | "Checks feature tool names" | "Checks workspace manifests" (use `validate`) |
| `build` only for compile or bundle | "Builds each active surface" | "Builds the provider sign-in list" (use `derives`) |
| `carry` is retired | "Relays requests from the renderer to main" | "Carries requests from the renderer to main" |
| `buffer`, `surface`, `channel`, `store` are nouns | "the canvas document buffer" | "Buffers feature-provided context" (use `accumulates`) |

## Header model

- **Summary:** one sentence, at most 30 words, physically the first line. States the file's purpose and why a reader would open it. Use a noun phrase when the file is the thing it defines (contract, type surface, format, contribution set, entry point, or capability); open with the operation's verb when the file performs an operation or holds stateful behavior.
- **Elaboration:** at most one `//` paragraph after the summary. Its length scales with the file's size. It stays at the file's medium abstraction level, extends the claim with mechanism, constraints, and hidden guarantees, and never restates the summary or inventories exports.
- **Boundary:** one sentence must state the file's whole responsibility. Two sentences mean two responsibilities, so split the file. Files always read or edited together are one responsibility, so merge them. File length is irrelevant.
- **Siblings:** within a directory, the summaries must make clear when to read each file. Overlapping summaries mean merged responsibilities or unseparated summaries. The directory `AGENTS.md` overview states the group responsibility and how the files relate; the generated index shows the division of labor. Do not restate file summaries in the overview.

## Process rules

- Read each file before writing its header; the summary states the responsibility, not the mechanism. When a file performs an operation the vocabulary owns, its summary opens with the controlled verb.
- Migrate existing nonconforming uses in the same change. Historical records (decisions, design threads, `plans/archive`) keep their wording.
- Run `npm run docs:index` after any summary or `AGENTS.md` change. Run Vale on changed linted docs. Run `npm run lint`. Keep tests green.
- Re-derive file lists from the tree rather than trusting this plan's inventory if the code has moved; the vocabulary and model above are authoritative.

## Unit one: Migrate the indexed `src/main` headers

Fix the nonconforming headers and `AGENTS.md` summaries. Each rewrite is one line; verify the file's operation before choosing the verb.

| File | Now | Becomes |
| --- | --- | --- |
| `src/main/turn-state.ts` | Saves and restores | Commits and restores |
| `src/main/document-store.ts` | Stores each document's content | Persists each document's content |
| `src/main/agent-skill-registry.ts` | Collects feature-provided Pi skill paths and supplies them | Assembles feature-provided Pi skill paths and provides them |
| `src/main/agent-system-prompt-registry.ts` | Collects each feature's system-prompt section and joins them for Pi | Assembles each feature's system-prompt section in workspace order for Pi |
| `src/main/keybindings/requests.ts` | Merges renderer action defaults with persisted overrides | Assembles renderer action defaults with persisted overrides |
| `src/main/keybindings/settings.ts` | …group that stores user keybinding overrides | …group that persists user keybinding overrides |
| `src/main/agent-tools/registry.ts` | Keeps accepted feature tools | Retains accepted feature tools |
| `src/main/settings-registry.ts` | Keeps validated settings | Retains validated settings |
| `src/main/external-links.ts` | Keeps renderer navigation contained | Contains renderer navigation |
| `src/main/features/surfaces.ts` | …and keeps active surfaces in workspace and declaration order | …and retains active surfaces in workspace and declaration order |
| `src/main/features/manifest.ts` | Checks workspace manifests | Validates workspace manifests |
| `src/main/agent-context/registry.ts` | Buffers feature-provided context | Accumulates feature-provided context |
| `src/main/ipc.ts` | Carries requests from the renderer to main | Relays requests from the renderer to main |

`AGENTS.md` fixes in the same unit:

- `src/main/features/AGENTS.md`: the summary is two sentences ("…builds their renderer surfaces. It also creates bare editable workspaces."). Merge into one sentence ending ", and scaffolds bare editable workspaces."
- `src/main/keybindings/AGENTS.md`: summary says "merge renderer defaults" — use "assemble".

**Acceptance:** no nonconforming word from the cheat sheet remains in any `src/main` header or `AGENTS.md` summary; indexes regenerated; Vale clean; lint and tests green.

## Unit two: Author the `src/api` headers

`src/api/` is the feature-author contract boundary and currently has no `AGENTS.md`. Add one, then give every production file there a header. The files missing headers:

`workspace.ts`, `channels.ts`, `settings.ts`, `actions.ts`, `shortcuts.ts`, `index.ts`.

Frame headers as contracts: they state what the author declares or receives, not how it is implemented. Reuse the established tone of the files that already have headers ("feature contribution contract", "agent channel contract", "typed channel contributions"). The `AGENTS.md` overview states the api boundary as one group: author contracts that features import and the substrate implements.

**Acceptance:** every `src/api` production file has a summary; sibling separation holds (an author can tell which contract to read); the `AGENTS.md` index is generated and Vale-clean.

## Unit three: Settle the HTML summary rule

`src/renderer/index.html` and `src/renderer/picker.html` start with `<!doctype html>`, which conflicts with the first-line summary rule. Decide the rule and record it in the Source-file headers section of `naming-and-comments.md`:

- Preferred: keep the rule strict and place `<!-- summary -->` before the doctype. HTML5 permits comments and whitespace before the doctype; verify the renderer's HTML tooling accepts it.
- Only if tooling requires doctype-first: allow the summary on the line after the doctype and state the exception.

**Acceptance:** the rule is recorded in one place; both HTML files conform; the renderer still loads.

## Unit four: Renderer tree

Give `src/renderer/` an `AGENTS.md` (summary, overview that states the group responsibility and how the workspace, picker, and entry files relate, generated index), then add headers to every production file missing one. The workspace subsystem is the largest gap:

`workspace/session-controller.ts`, `workspace/action-registry.ts`, `workspace/action-context.tsx`, `workspace/session-actions.tsx`, `workspace/action-keyboard-dispatcher.tsx`, `workspace/keybinding-sync.tsx`, `workspace/shortcut-platform.ts`, `workspace/keyboard-event-shortcut.ts`, `workspace/action-binding-projection.ts`, `workspace/action-resolution.ts`, `workspace/session-context.tsx`.

Upgrade the stubs in the same unit: `renderer/main.tsx` ("renderer entry."), `picker/main.tsx` ("picker entry."), `picker/Picker.tsx` ("start picker."), `preload/index.ts` ("preload."). Each becomes a sentence naming the responsibility and why a reader would open it. Watch sibling separation among the action, keybinding, and session files, which form one subsystem.

**Acceptance:** all `src/renderer` production files have summaries; the `AGENTS.md` overview explains the subsystem without restating file summaries; stubs are real sentences; index generated; Vale clean.

## Unit five: Chat feature

Give `src/features/chat/workspace/` an `AGENTS.md` (or extend the feature-level guidance if one exists), add headers to the missing files, and upgrade the `Chat.tsx` stub ("chat surface."). The missing set covers the block components, tool content, pills, modals, and provider-auth UI:

`workspace/blocks/*` (MessageChatBlock, ChatBlockFrame, ToolChatBlock, ErrorChatBlock, ChatBlock, CustomMessageChatBlock, content/MarkdownContent, content/HighlightedCode, content/CodeBlock, tool/content/CanvasToolContent, tool/content/DefaultToolContent, tool/content/CommandToolContent, tool/content/FileToolContent, tool/presentation.ts, tool/presentations.tsx, plus the CSS files), `workspace/ModelPill.tsx`, `workspace/SessionPill.tsx`, `workspace/ProviderLoginModal.tsx`, `workspace/ProviderAuthFlowPanel.tsx`, `workspace/surface.tsx`, `workspace/agent-controls.ts`, `workspace/model-actions.ts`, `workspace/provider-auth-presentation.ts`, `workspace/pending.ts` (already headed; verify), `shared/settings.ts`, and the CSS files without summaries.

Block and tool-content files are UI components: noun-phrase summaries name the rendered role ("Tool chat block content for file reads"). Sibling separation matters most among the block variants, so name the distinguishing content or role in each.

**Acceptance:** every `src/features/chat` production file has a summary; block variants are distinguishable at a glance; the `AGENTS.md` overview covers the chat workspace as a group; index generated; Vale clean.

## Unit six: Canvas feature

Add headers to the missing canvas files and upgrade the `Canvas.tsx` stub ("canvas surface."):

`src/features/canvas/workspace/frame-messages.ts`, `src/features/canvas/backend/anchored-format.ts`, `src/features/canvas/backend/contributions/index.ts`, `src/features/canvas/shared/channels.ts`.

**Acceptance:** every `src/features/canvas` production file has a summary; the existing canvas headers (document-buffer, shim, contributions, anchors) still hold under the sibling test; index generated; Vale clean.

## Unit seven: Feature entry stubs

`src/features/chat/index.ts` ("chat feature entry."), `src/features/canvas/index.ts` ("canvas feature entry."), and `src/features/workspace-tools/index.ts` ("Default workspace-tool feature."). The first two are acceptable role statements if the sibling test holds; upgrade `workspace-tools/index.ts` to name the default workspace-tool feature's responsibility.

**Acceptance:** every `src/features/*/index.ts` summary states the feature's role or responsibility; none describes default-ness as the responsibility.

## Final acceptance

- Every indexed and unindexed authored production file in `src/` has a first-line summary of at most 30 words; complex files carry an elaboration that extends, never restates.
- No nonconforming word from the cheat sheet appears in any header, `AGENTS.md` summary, or active doc prose.
- Each `AGENTS.md` overview states its group responsibility and file relationships without restating file summaries.
- `npm run docs:index`, `npm run lint`, and Vale over changed docs all pass; tests stay green.
