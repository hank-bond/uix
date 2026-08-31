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
| `frame` | noun (platform APIs) | Low-level unit directly named and exposed by a source platform or protocol, such as a stack frame, animation frame, CSP `frame-src`, or RFC 6455 frame. Use `iframe` for an HTML embedded browsing context, `message` for a complete application transport unit, and the specific UI role for visual structure. | `requestAnimationFrame(...)`, "stack frame" | `WebSocketRequestFrame` for a complete WebSocket message |
| `handle` | verb (Electron) | Register an Electron IPC invocation handler. Use UIX-owned role nouns outside a direct representation of that API. | `ipc.handle(...)` | `ChannelRequestContribution.handle` for a stored UIX callback |
| `iframe` | noun (HTML) | Embedded browsing context represented by an HTML `<iframe>` element. Use the complete term rather than `frame`. | "the Canvas iframe posts a message" | "the Canvas frame posts a message" |
| `message` | noun (Pi/browser/Electron APIs) | Complete logical communication unit surfaced as one value by a source API, including a Pi transcript message or an application transport message accepted or delivered by WebSocket, `postMessage`, or Electron IPC. Any lower-level framing is already handled. | `WebSocketRequestMessage`, "assistant message" | `WebSocketRequestFrame` for the value delivered by a WebSocket `message` event |
| `Renderer` | noun (browser/Electron) | The web display execution environment or a mechanism that directly manages it. Reserve UIX-owned adoption for substrate display execution. Use `Presentation` for human-facing material prepared for that boundary. | `renderer process` | `ToolChatRenderer` |
| `Runtime` | noun (Pi) | Pi's lifecycle engine: the extension behavior (tools, hooks, commands) registered during the last Pi extension load, plus Pi's live model runtime and session runtime. UIX's agent runtime manages Pi runtime state. | "Pi runtime", "Pi's live model runtime" | "the Pi runtime" for UIX's agent runtime |
