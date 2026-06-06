---
summary: "Pi ships the tools to customize itself and little else (no subagents, permissions, or MCP) — you build those through its integration points. UIX mirrors this ethos one layer up for visual UI: ship composable primitives and a thin default chrome, not fixed features. Read before adding any built-in UI feature."
status: accepted
---

# Pi's self-extension ethos, mirrored for UI

Pi's design ethos: **it provides the tools to customize itself and basically nothing more.** It ships no subagents, no permission system, not even MCP support. Instead it exposes the integration points — custom tools, extensions, the event stream, prompt and system-prompt hooks, message and tool renderers — and you ask the agent to build the capability you want; it reads its own docs and code and extends itself. Subagents, permissions, MCP are things you _make_ with pi, not things it bundles. This is exactly why pi is embeddable as UIX's agent core: it is a substrate, not a finished app.

**UIX mirrors this ethos, one layer up, for visual UI.** Where pi gives the agent the tools to extend its own behavior, UIX gives the human — and, through registered capabilities, the agent — the primitives to extend the _surface_. We do not ship a fixed set of UI features; we ship composable primitives and a thin default chrome built on top of them:

- The **canvas** is a blank slate — raw HTML in an own-origin iframe — because Chromium is already the maximally customizable render target. New canvas powers arrive as shim/API primitives (triggers, cross-pane data transfer), not bespoke features.
- The **conversation** pane is the React-path equivalent: typed conversation blocks rendered through registries, so new conversational elements are _registered and composed_, not hardcoded. See [conversation-render-primitives](../design/conversation-render-primitives.md).

**The test.** When tempted to hardcode a UI feature, ask whether it should instead be a primitive that something registers or composes. The cockpit's default chrome is the bare-bones baseline — and it is itself built on the same public primitives (first-party, no privileged path), so anything the defaults can do, an extension can too. This is the visual-UI restatement of [uix-is-a-pilot-substrate](./2026-05-30-uix-is-a-pilot-substrate.md): define small primitives, not big components, and compose.
