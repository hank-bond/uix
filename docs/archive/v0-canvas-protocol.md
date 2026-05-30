# v0 Canvas Protocol (archived)

This is the original `TRELLIS_V0.md` spec. Most of it is superseded by
`TRELLIS.md` (the current substrate spec). It is preserved here because parts
remain useful as design notes for whoever eventually builds the canvas
extension:

- §2 "Unblocked beats awkward" — substrate-level discipline.
- §4.1 URL schemes (noun + `trellis://` verb) — design for an extension that
  wants the agent to address resources and trigger commands.
- §4.3 Snapshot-per-turn / pi tree as canvas history — the canonical example
  of the hybrid state-persistence pattern (custom session entry references
  content-addressed file). Worth reading when building any extension that
  needs per-turn versioned state.
- §4.4 State diff — per-element-named-input delta format.
- §7 "What's deliberately out" — substrate-level anti-scope.

The rest (§1, §3, §5, §6, §8, §9, §10, §11) is fully superseded by
`TRELLIS.md`.

Original spec follows.

---

# Trellis v0 — Spec

> Companion to `PROJECT_BRIEF.md`. The brief sets vision and motivation; this doc pins down the v0 protocol and what we will and won't build for it.

---

## 1. What this is

Trellis v0 is **the minimal surface for an efficient, expressive, reliable agent ↔ HTML ↔ human interface.** Nothing else.

It ships as two halves connected by a small file/URL contract:

- A set of **pi extensions** (agent-facing): a system-prompt addendum, turn-boundary hooks, custom entry types, and (eventually) tools.
- An **Electron cockpit** (human-facing): panes, an in-iframe bridge, a URL resolver, file watchers, snapshot lookup.

Everything richer — design systems, component libraries, specific HUD recipes, viz tools, code-review flows — is meant to be built on top by users.  a batteries included version would look like the same relationship oh-my-pi has to pi.  we want to focus on the scaffolding that enables others to build the interface they want.

---

## 2. Operating principles

The hardest one first:

> **Unblocked beats awkward.**
>
> If a workflow is possible via existing primitives, we don't add a new primitive to make it nicer. We say no. This is the pi maintainer's discipline copied wholesale. The base shrinks features it ships in favor of features users build.

Then the three adjectives that describe the protocol's job:

- **Efficient** — token-thrift everywhere. Tight per-element diffs. Lean on concepts like hash-anchor edits (see https://dirac.run/posts/hash-anchors-myers-diff-single-token). Don't make the agent retype things to communicate them.
- **Expressive** — HTML + URL schemes give the agent a huge surface with no DSL to learn. Anything from a quiz to a call tree to a chart is just a file the agent writes.
- **Reliable** — state continuity, snapshot-per-turn, no silently-lost user input. Pi's tree *is* the canvas history.

Inclusion test for any proposed base feature:

1. Does this enable a use case otherwise impossible? — *maybe base.*
2. Does it make the protocol more efficient, expressive, or reliable? — *maybe base.*
3. Does it make an existing workflow nicer / faster / prettier? — *oh-my-trellis.*
4. Does it ship opinions about look, structure, or recipe? — *oh-my-trellis.*

When in doubt: out.

---

## 3. The two halves

```
┌─────────────────────┐         ┌─────────────────────┐
│ pi extension(s)     │         │ Electron cockpit    │
│ (agent-side)        │         │ (human-side)        │
│                     │         │                     │
│ - system-prompt     │         │ - conversation pane │
│   addendum          │ ──────→ │ - canvas pane       │
│ - turn-boundary     │ contract│ - bridge script     │
│   hooks             │ ←────── │ - URL resolver      │
│ - custom entry      │         │ - stream URL parser │
│   types             │         │ - file watchers     │
│ - (optional tools)  │         │ - snapshot resolver │
└─────────────────────┘         └─────────────────────┘
         ▲                                ▲
         │   shared via file/URL contract │
         │   (canvases, snapshots,        │
         │    custom entries, schemes)    │
         └────────────────────────────────┘
```

Neither half owns the contract. Either can be replaced. Each is independently useful:

- The pi extension alone gives anyone running pi in a terminal a canvas-writing workflow that produces meaningful HTML files (unrendered, but real).
- The cockpit alone could render any HTML following the convention, regardless of who wrote it (an extension, a cron job, a totally different agent).
- Together they make the cockpit experience.

This is the network-effect mechanism. New pi extensions paint new HUDs in the same cockpit; alternate cockpits render the same extensions; both compose freely.

---

## 4. The protocol

The contract has four parts: URL schemes, canvas files, snapshots, state diffs. Plus one streaming behavior.

### 4.1 URL schemes — the address layer

**Noun schemes** (resources; default action is "show/navigate"):

| Scheme | Addresses |
|---|---|
| `file://path[#Lnn]` | a location in a source file |
| `entry://<id>` | a turn in the session tree |
| `report://<name>` | a canvas |
| `skill://<name>` | a skill |
| `session://<id>` | a whole session |

Adding new noun schemes is an extension concern — `pr://`, `issue://`, etc. follow the oh-my-pi pattern.

**Verb scheme** (commands; never auto-fire):

| URL | Meaning |
|---|---|
| `trellis://submit/<id>?...` | submit a form payload |
| `trellis://run/<action>?...` | trigger a named action |
| `trellis://fork/<entry-id>` | pi tree fork |
| `trellis://label/<label>?entry=<id>` | apply a label |

The split rule: **schemes are nouns or `trellis://`.** If you want the user to be able to *trigger* a thing, use `trellis://`. If you want to *point at* a thing, use a noun scheme.

### 4.2 Canvas files

A canvas is an HTML file at `<project>/.trellis/canvas/<name>.html`. The agent writes it using normal file tools (`Write`, `Edit`, or pi's hash-anchor variants). The cockpit renders it in a sandboxed iframe with one bridge script injected.

**Naming discipline** (taught by the skill):

- Every interactive element gets a unique `name` attribute.
- Radio groups share a `name`; their `value` discriminates (HTML standard).
- Elements without names are not tracked by the state diff. The bridge emits a warning into the conversation if it finds untracked inputs.

Default canvas is `main.html`. Multiple canvases are supported; convention is "name = file basename."

### 4.3 Snapshots — versioning tied to the pi tree

At each agent turn boundary, the **pi-extension hook** does:

1. Read the current contents of each open canvas.
2. Compute its content hash.
3. Write `<project>/.trellis/canvas/snapshots/<hash>.html` if not already present (deduped).
4. Append a custom entry to the session:
   ```ts
   session.appendCustomEntry({
     type: "trellis:canvas",
     canvas: "<name>",
     contentHash: "<hash>"
   });
   ```

When the **cockpit** resolves which snapshot to show for a canvas:

1. Walk back from the current tree entry to the most recent `trellis:canvas` entry whose `canvas` matches.
2. Load `snapshots/<contentHash>.html`.
3. Render it. Set the bridge's diff baseline to this same snapshot.

Consequences:

- Pi's tree *is* the canvas history. No parallel timeline.
- Navigate back → canvas rolls back. Fork → canvas forks with the branch.
- 10-turn conversation that updates the canvas twice stores two snapshots, not ten.
- Snapshots are content-addressed → easily garbage-collected against the live set of custom entries.

### 4.4 State diff — what the agent sees on submit

When the user sends a message in the conversation pane, the bridge:

1. Snapshots the live iframe DOM.
2. Walks each named interactive element (`<input>`, `<select>`, `<textarea>`, button states).
3. Compares against the same elements in the current baseline snapshot.
4. Emits a tight per-element delta:

   ```
   [canvas main: changes]
   design (radio=minimal) → +checked
   include-deprecated (checkbox) → -checked
   notes (textarea) → "prefer inline"
   ```

   Format: `<name> (<tag>[=<discriminator>]) → <delta>`. One line per changed element. Tag in parens for context. Only the bits that changed.

5. Writes the user's current input values back into the canvas HTML file in-place (`value=`, `checked`, `selected` attribute updates on existing tags — done with `parse5` or equivalent so structure isn't disturbed).
6. Prepends the delta block to the user's message before forwarding to pi.

**Important:** the diff captures *user changes since the last agent turn snapshot*. Agent edits between turns aren't diffed in — the agent did them, it knows.

### 4.5 Stream URL detection

The cockpit watches the agent's streaming text output for completed URLs (terminated by whitespace, quote, or angle bracket). Behavior:

- **Noun-scheme URL completes mid-stream** → auto-fire navigation (open in the appropriate pane). Cheap to undo, useful for "the agent is about to explain `parseConfig` and the code pane already shows it."
- **Verb-scheme URL** (`trellis://`) → render as a live link/button in the conversation pane. Never auto-executes. User must click.

Detection is a simple regex; no streaming HTML parser required.

---

## 5. Pi extension surface

What the **base** Trellis pi extension(s) provide. Single package vs. several is an open question (§9); the surface itself is small either way.

**System-prompt addendum**

The canvas convention is environment, not opt-in behavior, so it lives in the system prompt — not in a skill. The extension appends one short section teaching the agent:

- The canvas convention (path, multiple canvases, structure).
- The URL schemes (noun vs verb, when to use each).
- The `name`-attribute discipline.
- How user state arrives (the delta block on the next message).
- "Preserve user input fields when you rewrite the HTML — the cockpit syncs values, but if you delete the element they're gone."

Exact wording is an open question (§10); the content above is the minimum coverage.

**Custom entry type:** `trellis:canvas`

`{ canvas: string, contentHash: string }`. Pi already supports custom entries; this is just a declared type.

**Turn-boundary hook**

Post-turn: read open canvases, hash, write snapshots, append custom entries.

**Tools (v0: none required)**

Agent can do everything with its existing file tools. Custom tools (`canvas.patch`, `canvas.set` etc.) are added only when friction demands them, per the operating principle. Likely candidates if/when added:

- `canvas.patch(name, target, html)` — surgical update by name/id, hash-anchor style.
- `canvas.list()` — enumerate open canvases.

Defer.

---

## 6. Cockpit surface

What the **base** Electron app does. All small, all composable.

- **Conversation pane** — subscribes to pi events via IPC, renders messages (plain text day one; richer rendering is oh-my-trellis), hosts the prompt input.
- **Canvas pane** — for each open canvas, renders the current snapshot (resolved from the pi tree) in a sandboxed iframe with the bridge script injected.
- **Bridge script** (injected into every iframe) — intercepts:
  - `click` on `<a href="<scheme>://...">` for known schemes.
  - `submit` on `<form action="<scheme>://...">` for known schemes.
  - Forwards both to the URL resolver via IPC.
- **URL resolver** — switch on scheme; noun → navigate/display; `trellis://` → command. Today a hardcoded switch; tomorrow a registry (the natural extension point).
- **Stream URL parser** — regex over event-stream text deltas; auto-fires noun URLs; marks verb URLs as live links.
- **File watcher** — `fs.watch` on `.trellis/canvas/*.html` for external edits (agent edits via tools, or user edits via their editor); re-renders.
- **Snapshot resolver** — given the current pi tree entry, walks back to find the latest `trellis:canvas` entry per canvas; loads the HTML by hash.
- **State diff emitter** — on user-message-send: snapshot iframe DOM, compute named-element delta, write attrs back to HTML, prepend delta to prompt before forwarding.

That's the entire cockpit. No code editor. No tree pane. No labels UI. No HUD widgets. No design system beyond the iframe's default styles.

---

## 7. What's deliberately out

None of these ship in base:

- **Design system / theme.** Default is the browser's. Users supply their own CSS conventions in oh-my-trellis layers.
- **Component library / UI primitives** beyond raw HTML.
- **Templates, web components, "rich block" vocabularies, JSX-as-output.**
- **Renderer extensions** (template engines, JSON → HTML compilers).
- **Code editor pane.** VS Code is right there. Trellis is the cockpit next to it.
- **Tree visualization pane.**
- **Reflection queue.**
- **Cost / HUD widgets.**
- **Markdown rendering.** Agent writes HTML; if you want markdown rendered, your extension does it.
- **Search, multi-file UI, file tree.**
- **Syntax highlighting** in code blocks.
- **Skill management UI.**
- **Anything else VS Code-shaped.**

All of the above belong in oh-my-trellis packages built on the protocol.

---

## 8. Tech stack v0

Cockpit:

- Electron + electron-vite
- TypeScript
- React (renderer)
- Plain CSS for the chrome (Tailwind only if/when we want shadcn snippets — defer)
- `parse5` (or `cheerio`) in main for HTML attribute writebacks
- Node `fs.watch` for file watching
- A thin typed IPC wrapper (~30 lines)

Pi extension:

- Pi / oh-my-pi SDK
- TypeScript

Tests:

- Vitest, for parsers/schemas, not React components

Refused day-one: Zustand, SQLite, Monaco, workers, Comlink, virtualization, @parcel/watcher, shadcn (beyond ad-hoc snippets), React Compiler, Zod (until a schema surface clearly demands it).

Each refused thing has a clear trigger condition. None of those triggers exist for "render a canvas, diff user state, emit URLs." When a trigger fires, the dep arrives in an evening.

---

## 9. Day-one milestones

Each step end-to-end before the next.

1. **Scaffold the cockpit.** electron-vite + React + TS. `pnpm dev` runs.
2. **Wire pi into main.** `createAgentSessionRuntime()`, one IPC channel for `prompt`, one for `agent-event`. Conversation pane renders plain-text streaming.
3. **Scaffold the pi extension package.** Empty extension that registers the system-prompt addendum + custom entry type. No tools, no hooks yet.
4. **Canvas v0.** Cockpit watches `.trellis/canvas/main.html`, renders in a sandboxed iframe. Agent writing a file produces a visible page.
5. **Bridge script.** Injects into the iframe, catches `click` on `trellis://` and noun-scheme links, posts a stub message back via IPC.
6. **Snapshot hook.** Extension captures HTML at turn boundary, writes to `snapshots/`, appends `trellis:canvas` custom entry.
7. **Snapshot resolver.** Cockpit walks tree on navigation, loads the right snapshot per canvas. Rollback works.
8. **State diff emitter.** On user-message-send, compute delta against current baseline snapshot, write attrs back to HTML, prepend delta to prompt.

After step 8, the entire protocol is live end-to-end. Everything else is built on top.

---

## 10. Open questions

- **One pi extension package or several?** Pi philosophy says several — hash-anchor extension separate from canvas extension separate from snapshot-hook extension. Defer until repo layout forces a decision; lean toward several.
- **Cockpit handling of multiple canvases.** v0 supports it (file basename = canvas name) but UX of "which canvases are open / which is focused" is undecided. Probably hardcode single canvas for the first real iteration.
- **Conversation pane during tree navigation.** When you navigate back, does the conversation pane also re-render to the historical state? Probably yes, following pi's semantics. Confirm against SDK.
- **Bridge security model.** Iframe is sandboxed (`sandbox="allow-forms allow-same-origin allow-scripts"`). What about CDN scripts the agent embeds (mermaid, etc.)? Default permissive, revisit when something breaks.
- **Exact system-prompt addendum wording.** Iterate against real sessions.
- **Diff format edge cases.** Multi-select. File inputs. Disabled state. Defer; design as they appear.
- **Naming the verb scheme.** `trellis://` is fine. Reconfirm before publishing.

---

## 11. The shape, in one sentence

**Trellis v0 is a minimal protocol — HTML files plus URL schemes plus snapshot-per-turn — and the smallest pi-extension/Electron-cockpit pair that makes the protocol work; everything richer is meant to be grown on top as oh-my-trellis.**
