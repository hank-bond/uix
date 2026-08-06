---
summary: "Imported terms retain the meaning and grammar of their source API when UIX directly represents the external concept."
kind: reference
read_when: "Read before using or naming a Pi, Electron, React, or browser-standard term."
---

# Imported terms

## Imported terms

These terms retain the meaning and grammar of the named source API when UIX directly represents the external concept. The part-of-speech cell appends the provenance.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Disposable` | noun (ECMAScript) | Object with deterministic cleanup through `Symbol.dispose`. Use a more specific capability role when cleanup is not its defining operation. | `DisposableBag` | `ActionContributionDisposable` for an update-and-dispose capability |
| `handle` | verb (Electron) | Register an Electron IPC invocation handler. Use UIX-owned role nouns outside a direct representation of that API. | `ipc.handle(...)` | `ChannelRequestContribution.handle` for a stored UIX callback |
| `Renderer` | noun (browser/Electron) | The web display execution environment or a mechanism that directly manages it. Reserve UIX-owned adoption for substrate display execution. Use `Presentation` for human-facing material prepared for that boundary. | `renderer process` | `ToolChatRenderer` |
