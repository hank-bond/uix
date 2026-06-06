---
summary: "Parking lot for named but unresolved substrate, documentation, and future-app questions. Read before turning an open question into a decision or build plan."
status: active
---

# Open questions

Things we've named but not resolved. Each gets pinned to a milestone when it becomes blocking; when resolved, it graduates to a [decision](../decisions/).

## Substrate

- **Manifest / context shape stability.** AGENTS.md commits to "extensions register contributions through a small context object," but the exact shape of the injected `uix` API is undefined. Likely settled while building the pane host + contribution registry. First concrete forcing function: the conversation render registries (`registerToolRenderer` / `registerMessageRenderer`) that [conversation-render-primitives](../design/conversation-render-primitives.md) needs on `@uix/api` — built first-party/in-process, then exposed to frontend extensions. (Note: the _pi-side_ write handle for session state is separately resolved — UIX-core rides pi's own `ExtensionAPI` via an in-process factory, see [session-file-as-state-substrate](../decisions/2026-06-06-session-file-as-state-substrate.md). This open question is the distinct _UIX-frontend_ `@uix/api` shape.)
- **Agent-authored conversation blocks vs. [no-agent-ui-manipulation](../decisions/2026-05-30-no-agent-ui-manipulation.md).** That decision says the agent edits files, not the UI. Letting the agent emit a typed, registered conversation block (e.g. `<rich-diff>` via a tool) needs the boundary drawn explicitly: the agent may author presentation of _its own turn output_ into the transcript, but may not hold UI handles or mutate other panes except through their file/channel contracts. Resolve and graduate to a decision when [conversation-render-primitives](../design/conversation-render-primitives.md) lands its first agent-triggered component.
- **Channel transport unification.** One API, two transports (in-process + `postMessage`). Where does the boundary live — at the channel itself, or at a transport adapter behind it?
- **Slot taxonomy.** What named slots does the cockpit shell expose? Minimum useful set vs. risk of overcommitting to a layout.
- **Hot-reload semantics for in-flight agent turns.** If an extension reloads mid-turn and contributed tools the agent is using, what's correct — pause, abort, or finish then reload?
- **Extension shapes — package.json always, or lighter shapes too?** Discovery currently requires `<root>/<name>/package.json` with a `pi` or `uix` field (see [extension-discovery-and-identity](../decisions/2026-05-30-extension-discovery-and-identity.md)). A file/folder-name convention (`notify.pi.ts`, `notify/{pi.ts, uix.ts}`) could carry side-disambiguation instead. Decide when ceremony is felt — likely after 3–5 dogfood extensions. Loosening later is easy; tightening forces migration.

## Documentation

- **`src/docs/` ↔ `docs/` split discipline.** Easy to drift. The habit: when an extension API changes, the `src/docs/` page changes in the same commit. `docs/` may lag code; `src/docs/` may not.
- **What does `conventions.md` become** once there's a stable extension lifetime API? Likely splits: cockpit-internal rules stay here, extension-author rules move to `src/docs/lifetimes.md`.

## Future apps (not substrate, but shaping it)

- **Code-reviewer app.** The original "reports + question blocks + side-quest" design lives in [`../plans/archive/project-brief.md`](../plans/archive/project-brief.md). When it becomes an extension package, it gets its own design doc.
- **Knowledge base / wiki app.** Not yet specified. Decomposes into pi extensions (backend fetch/transform, content+provenance tools) + frontend extensions (panes) + state documents — the "case 2 / application" tier sketched in [canvas-data-channel](../design/canvas-data-channel.md).
- **Shared shape between the two.** Both want rich rendered panes, inline interactive blocks, on-disk artifacts, and channels that send small diffs and occasional turn-triggering events. The substrate must support both cleanly.
