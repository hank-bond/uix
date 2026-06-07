---
summary: "The initial stack and the alternative each piece beat: Electron, React + Compiler, Zustand, TypeBox, Monaco, SQLite-as-index, and in-process pi."
status: accepted
---

# Stack landings

| Choice | Picked | Rejected | Why |
| --- | --- | --- | --- |
| Shell | Electron + electron-vite | Tauri | Shipping speed; discipline + Electron gets VS Code–class performance. Installer cost paid once on a dev machine. |
| Language | TypeScript everywhere | — | One language across main, preload, renderer, extensions. |
| UI | React + React Compiler | Solid | Compiler auto-memoization removes the perf-tuning tax that favored Solid; bigger ecosystem, stronger LLM coverage. |
| Components | shadcn/ui on Radix + Tailwind | Mantine | Small primitives, maximal composition, code you own. |
| State | Zustand | Redux, Jotai | Tiny API, no ceremony, composes by importing slices, persists trivially. |
| Schemas | TypeBox everywhere | Zod, mixing both | See [typebox-not-zod](./2026-05-30-typebox-not-zod.md). |
| Editor | Monaco behind one `<Editor mode>` | CodeMirror 6 | Philosophical exception; isolation keeps it swappable. |
| Virtualization | @tanstack/virtual | — | Non-optional once trees/chats/reports have many items. |
| Workers | Web Workers + Comlink | — | JSONL parsing/indexing without blocking UI. |
| Storage | better-sqlite3 (derived index) + files (truth) | — | Cross-session queries are slow on JSONL; SQLite is a rebuildable mirror. |
| File watching | @parcel/watcher | chokidar | Faster at scale. |
| Tests | Vitest | — | — |
| Agent integration | pi SDK in main (`createAgentSessionRuntime`) | Subprocess (`--mode rpc`) | Typed events, direct agent state, in-process tool/extension contribution; subprocess loses all three. |
| Not picking | router, async query lib, CSS-in-JS, large component library | — | Resist accidental complexity. |

Subprocess pi may be revisited via `utilityProcess` if in-process pi becomes a stability concern; not day one.
