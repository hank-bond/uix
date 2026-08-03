---
summary: "Selected Pi session graphs persist under each workspace, while UIX projects summaries, history, streaming items, and renderer session controls."
kind: reference
status: active
---

# Sessions and transcripts

UIX persists Pi session graphs under the workspace state root. The `session.selected` workspace setting stores the selected durable session id.

Startup opens that graph when it exists. A stale selection falls back to the newest graph and repairs the setting.

The selected graph is durable backend choice. The active `AgentSession` is Pi's ephemeral runtime over that graph. The renderer's active session is a read-only projection.

## Session requests

The agent channel provides these session requests:

- `session_history({ sessionId? })` returns a `SessionSummary` and durable `TranscriptSnapshot`.
- `list_session_summaries({ limit })` returns recent graph summaries by newest filesystem activity.
- `new_session()` replaces the selected graph with a fresh Pi session.
- `switch_session({ sessionId })` selects an existing graph.
- `set_session_title({ sessionId, title })` sets or clears Pi's native title metadata.

Omitting `sessionId` from `session_history` reads the selected graph and establishes the shared active projection. An explicit id reads another graph without selecting or restoring it.

Recent summary loading does not open Pi model or authentication services. Each summary carries explicit title metadata and a bounded first-user-message preview independently.

`new_session` and `switch_session` reject while the agent runs. Each request commits settled feature turn state, changes the graph, restores target state, then persists selection.

Selecting the active graph returns its authoritative summary without replacing the runtime. A title mutation can target any graph without selecting it or opening Pi services.

Titles use Pi's single-line semantics and accept `null` to clear. UIX applies a defensive 4,096-Unicode-code-point limit before appending native `session_info` metadata.

## Renderer session controller

The workspace renderer owns active and recent session projections. Feature surfaces receive a read-only `WorkspaceSessionHandle` through `@uix/api/workspace`.

The controller hydrates active history and recents independently. Request and state versions reject stale asynchronous results.

A completed run refreshes recent summaries and reconciles the active first-message preview. Successful session mutations also refresh the recent projection.

Switch capability becomes unavailable during agent activity or another session mutation. Title changes may run during agent activity but serialize with other session operations.

The substrate-owned `uix.session.new` action uses the same controller path and defaults to `mod+n`. Chat provides the recent-session picker and title editor.

Features own presentation fallback text. Chat labels a row from explicit title, then first-message preview, then its own empty-session copy.

## Transcript projection

UIX keeps three units separate:

1. **Pi session entries:** Durable parent-linked history and state-machine records.
2. **`TranscriptItem` values:** UIX's normalized renderer wire model for live and replayed entries.
3. **Chat blocks:** Feature-owned rendered views over transcript items.

Main derives live and replayed items through the same projection. The layers are intentionally not one-to-one: one Pi entry may produce multiple transcript items, and one transcript item may eventually render as multiple Chat blocks. This separation lets each layer evolve without changing the durable session format.

A transcript update never replaces a complete turn or transcript. Streaming assistant text arrives as append-only `transcript_partial` text. Live tool progress arrives as replacement `partialResult` snapshots. Completion replaces only the affected item.

The renderer discards live tool partials when the final item arrives. History replay returns completed durable items.

Transcript ids become durable when Pi persists their entries. Only a streaming assistant row can begin with a transport-only id and receive one in-place rekey.

Every tool item stores its execution working directory. Main also derives `ToolFileLocation` for supported file tools.

A file location contains an absolute path and a display path. The display path is working-directory-relative when safe and absolute otherwise.

History seeds working-directory state from the session header and folds `uix.turn-state` transitions. Old tool rows never reinterpret paths against a later directory.

Chat may display a human-facing projection without changing the agent-facing payload. Canvas tool blocks, for example, hide anchor gutters while retaining anchored results.

See [`state.md`](./state.md) for branch-scoped feature restoration and [`agent.md`](./agent.md) for the owning runtime.
