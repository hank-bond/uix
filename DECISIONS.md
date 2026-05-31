# Decisions

A log of the load-bearing decisions behind Trellis: _why_ it exists, _why_ it's
shaped as a substrate rather than an app, and _why_ the stack is what it is.

For the current architecture, see [`TRELLIS.md`](./TRELLIS.md). For in-flight
work and open questions, see [`docs/architecture.md`](./docs/architecture.md).

---

## Why this exists

> "I am basically just creating a UI to hook [pi] into like a human in a Gundam.
> Normally the harness is tools you give to the agent, but I mostly want **tools
> you give to the human to work with the agent**."

This frame is the single most important design constraint. Trellis is not
adding agent capabilities. It is adding **pilot capabilities**: displays the
human sees, controls the human's hands operate, and memory aids that mean the
human doesn't have to hold everything in their head.

Every feature decision passes the test: _does this help the pilot see, decide,
or act?_ If it's "make the agent smarter," it belongs in pi, not Trellis.

## Why it's a substrate, not an app

Early framing treated Trellis as a single tailor-made IDE for coding agents —
conversation pane, tree pane, structured "reports" as the central artifact,
SQLite-backed reflection queue, side-quest workflow gesture. All of that is
still wanted, but as _applications built on Trellis_. The substrate split
happened once a second application surfaced — a knowledge-base / wiki manager
sharing nearly all of the same primitives (panes, channels, file watchers,
agent session, lifetime-scoped extensions) with none of the same UI.

The motivating problems behind the original IDE framing still drive substrate
decisions, because they're the reason we need the substrate to support these
shapes at all:

1. **TUI agents force linear, scroll-heavy interaction.** Questions at the top
   of a long response require scrolling up to read and back down to answer.
   Substrate consequence: panes must support _inline interactive content_
   anchored to document position, not just chat bubbles. → channels, iframe
   panes, declarative contributions.

2. **Reviewing agent-generated code is unreviewable at volume.** 1000-line
   diffs and 300-line markdown summaries don't survive review.
   Substrate consequence: extensions need to render _structured artifacts_
   (diffs, call-paths, navigable code) richly, separate from chat. → pane host,
   slot registry, file-watching for streaming "for free."

3. **Side-quest workflows are clunky.** Branch off, reflect, update skills,
   return, retry — the primitives exist in pi but the gestures don't.
   Substrate consequence: the cockpit needs to own the agent session and
   expose tree navigation as a first-class capability extensions can compose.
   → agent session manager, channel turn/silent/local modes.

4. **No queue for "fix this later."** No cross-session memory aid.
   Substrate consequence: cross-session enumeration and file-on-disk state
   need to be first-class so extensions can build worklists, dashboards,
   ledgers. → file watcher service, on-disk state pattern.

These same shapes also serve a knowledge base / wiki app, a design-system
deliverables app, and the not-yet-imagined apps. That's the test the substrate
keeps having to pass.

## Stack landings

| Choice            | Picked                                                      | Rejected                  | Why                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell             | Electron + electron-vite                                    | Tauri                     | Shipping speed. Discipline + Electron gets VS Code–class performance; the installer cost is paid once on a dev machine.                                                                                                                                                                                                             |
| Language          | TypeScript everywhere                                       | —                         | One language across main, preload, renderer, extensions.                                                                                                                                                                                                                                                                            |
| UI                | React + React Compiler                                      | Solid                     | React Compiler's auto-memoization eliminates the perf-tuning tax that would have favored Solid. Bigger ecosystem and stronger LLM training coverage.                                                                                                                                                                                |
| Components        | shadcn/ui on Radix + Tailwind                               | Mantine                   | Matches the project philosophy: small primitives, maximal composition, code you own.                                                                                                                                                                                                                                                |
| State             | Zustand                                                     | Redux, Jotai              | Tiny API, no ceremony, composes by importing slices, persists trivially.                                                                                                                                                                                                                                                            |
| Schemas           | TypeBox everywhere                                          | Zod, mixing both          | Pi requires TypeBox at the agent boundary (tool schemas). Channels need JSON Schema for validation + agent legibility. Using TypeBox for IPC, on-disk schemas, and config too means one mental model, no translation layer, and `$schema`-tagged configs are human-editable. Brief originally landed on Zod; revisited and dropped. |
| Editor            | Monaco, isolated behind one `<Editor mode="..." />`         | CodeMirror 6              | Philosophical exception. Large surface but does too much of what's needed to justify rebuilding. Isolation keeps it swappable.                                                                                                                                                                                                      |
| Virtualization    | @tanstack/virtual                                           | —                         | Non-optional once trees / chats / reports have many items.                                                                                                                                                                                                                                                                          |
| Workers           | Web Workers + Comlink                                       | —                         | For JSONL parsing / indexing without blocking the UI.                                                                                                                                                                                                                                                                               |
| Storage           | better-sqlite3 (derived index) + files (truth)              | —                         | Cross-session queries are slow on JSONL; SQLite is a rebuildable mirror.                                                                                                                                                                                                                                                            |
| File watching     | @parcel/watcher                                             | chokidar                  | Faster at scale.                                                                                                                                                                                                                                                                                                                    |
| Tests             | Vitest                                                      | —                         | —                                                                                                                                                                                                                                                                                                                                   |
| Agent integration | pi SDK via `createAgentSessionRuntime` in main              | Subprocess (`--mode rpc`) | Typed events, direct access to agent state, in-process tool/extension contribution. Subprocess loses all three.                                                                                                                                                                                                                     |
| Not picking       | router, async query lib, CSS-in-JS, large component library | —                         | Resist accidental complexity.                                                                                                                                                                                                                                                                                                       |

## Design principles (carry into code)

- **Define small primitives, not big components.** Compose.
- **One or two exports per module.** Resist barrel files and god-objects.
- **Schemas are sources of truth.** Don't hand-write parallel TS types.
- **Functions over classes.**
- **Events over polling.** Pi gives events; files have watchers; state emits
  to subscribers.
- **Append-only where possible.** Reports, sessions, custom entries.
- **Lifetime bags enforce pairing by construction.** Registration without a
  bag is a bug. See [`docs/conventions.md`](./docs/conventions.md).

## Schemas: why not split (TypeBox + Zod)

The earlier framing was TypeBox at the agent/channel boundary, Zod everywhere
else (forms, IPC, on-disk). Rejected because:

- Two schema libraries means every author has to ask "which one here?" That's
  the accidental complexity the principles section exists to resist.
- Zod's wins (slightly nicer ergonomics, friendlier default error messages,
  richer transforms) are real but small, and writing a tiny error-formatting
  wrapper once removes most of the gap.
- Form-layer validation — the strongest Zod use case — lives in extensions,
  not the substrate. Extensions can pick their own validator for purely
  internal state if they want; the substrate doesn't force a choice on them.
- TypeBox's `TypeCompiler` gives AOT-compiled validators that beat Zod on
  hot paths, and channel message validation is a hot path.

If an extension wants Zod for its internal state, that's fine. Substrate
surfaces (channels, IPC, contribution manifests, pi tool schemas, on-disk
schemas the substrate defines) are TypeBox.

## Rejected paths kept on record

- **"Agent generates JSX" for reports.** Rejected in favor of structured
  blocks in files — markdown + fenced custom blocks, parsed and rendered
  by an extension. The agent uses existing file-edit tools, not bespoke
  UI-manipulation tools.
- **"Custom RPC tool surface for the agent to manipulate the UI" generally.**
  Same rejection. Channels carry validated events; agent-side, file edits
  remain the canonical way to mutate persistent artifacts.
- **"Report as the conversation, structured."** Rejected in favor of
  _conversation pane is the conversation; reports are artifacts_. Two
  panes, not a merged one.
- **Subprocess pi.** See stack table. May revisit via `utilityProcess` if
  in-process pi becomes a stability concern; not day one.
