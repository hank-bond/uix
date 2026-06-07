---
summary: "Pi's append-only session JSONL is UIX's persistence substrate — all state (canvas pointers, anchor state) rides it as parent-linked custom entries, which is why UIX-core bindings run as an in-process pi extension to get write access."
status: accepted
---

# Pi's session file is UIX's state substrate

Persistence is the next phase (conversation across restarts, edit-diff durability, canvas snapshots per turn, conversation-tree navigation that restores the right canvas + anchor state). The decision: **don't build a parallel persistence system — ride pi's session file**, which is built for exactly this.

## What pi's session file is

An **append-only JSONL tree** (`SessionManager`, `CURRENT_SESSION_VERSION = 3`). A `SessionHeader` line, then entries. **Every entry carries `{ type, id, parentId, timestamp }`** — `id`/`parentId` _are_ the conversation tree; a branch is two entries sharing a parent. pi ships two purpose-built entry types for storing arbitrary state:

- **`CustomEntry<T>`** — `{ type: "custom", customType, data?: T }`. Pi's own doc: _"Persist extension state across session reloads. On reload, extensions scan entries for their customType and reconstruct internal state. Does NOT participate in LLM context."_ → home for **canvas version pointers and anchor state** (zero token cost).
- **`CustomMessageEntry<T>`** — adds `content` (which _does_ enter LLM context via `buildSessionContext`), `details?: T`, and a `display` flag → host-authored blocks the agent should also see.

Reading is open everywhere: `parseSessionEntries`, `loadEntriesFromFile`, `buildSessionContext(entries, leafId)`, and `ReadonlySessionManager` (`getEntries` / `getTree` / `getBranch` / `getLeafId` / `getEntry`), which sits on the tool `ctx.sessionManager`.

## Consequences

1. **Version pointers + anchor state live as `CustomEntry`, parent-linked into the tree.** The [pane-and-file-versioning](../design/pane-and-file-versioning.md) model — "conversation nodes hold `{docId: sha}` pointers; pi's tree is the only branch structure" — maps 1:1 onto a `CustomEntry`. We **annotate pi's tree**, never maintain a parallel one; pointers ride its forks/branches for free. This resolves that thread's open question #3 (where the pointers live).

2. **UIX-core bindings move from `customTools` to an in-process pi extension.** Writing `CustomEntry`/`CustomMessageEntry` goes through `appendEntry` / `sendMessage`, which live on pi's **`ExtensionAPI`** — not reachable from the `customTools` path, and `createAgentSession` has no inline `extensions` field. The supported in-process route (verified 2026-06-06): a pi `ExtensionFactory = (pi: ExtensionAPI) => void` passed via `new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [uixCore] })` → `loader.reload()` → `createAgentSession({ resourceLoader })`. That factory holds the live `ExtensionAPI`: `registerTool`, `appendEntry`, `sendMessage`, `registerMessageRenderer`, the `on(...)` hooks, and the message-transform seam. This is the "lower-level pi refactor" (canvas plan's U3), now a foundational dependency rather than an appetite call.
   - **`appendEntry(customType, data)` takes no `parentId`** — pi auto-attaches to the current leaf. `getLeafId()` / `getLeafEntry()` are available for correlation. The submit-boundary hook (`input`, before processing) vs turn hooks (`turn_start`/`turn_end`) chooses which node a pointer associates with.
   - **Do not hand-append the JSONL.** It races pi's own writer; always go through the API.

3. **This is the pi _extension_ system, distinct from UIX's frontend one.** `src/main/extensions/` + `@uix/api` is the cockpit's own extension system for frontend/pane contributions. The promotion here targets pi's separate backend extension system (`@earendil-works/pi-coding-agent`), loaded through pi's resource loader. The two share the factory _shape_ (a default-exported factory taking an injected API) but are different API objects with different jobs.

## Why this over a UIX-side store

A UIX sidecar keyed by pi entry ids would work but shadows pi's tree structure and risks divergence on fork/branch/compaction — and pi already content-addresses, branches, and persists the conversation we'd be keying against. Riding the session file keeps one source of truth for tree structure and inherits pi's branching, compaction handling, and (later) tree navigation. It also stays [hosting-compatible](./2026-05-31-hosting-compatible-by-default.md): the session file is a portable artifact, and the versioned content behind the `ContentStore` seam remains a separate, swappable store.

Build sequencing lives in the plan: [persistence-and-session-foundation](../plans/persistence-and-session-foundation.md).
