---
summary: "Agent and session routing: connections are URL-scoped to a workspace and session. Session switches re-target a connection in place. Agents are refcounted per workspace-session with a tunable TTL, and the host can author messages to them."
kind: explanation
---

# Agent and session routing

## Current synthesis

One runtime instance owns one workspace. Agents are mounted on workspace-session pairs. One active agent per session at a time.

Connections are URL-scoped. The address is `ws://host/<workspace>/<session>`. The workspace segment is the expensive path: switching workspaces is a new connection because the client composition rebuilds. The session segment is the cheap path: switching sessions re-targets the connection in place, with no reload. The client updates the URL via the history API so it stays canonical.

Each connection owns its session binding. Two tabs on the same session attach to the same agent. A session switch in one tab moves only that tab. The tabs are independent views over shared, refcounted agent infrastructure.

Agent lifecycle: the first request boots the agent through a coalesced promise. Concurrent requests attach to the same instance. The agent stays alive while its reference count is at least one. Zero connections starts a TTL grace period, then the agent tears down at a turn boundary. The TTL is user-tunable. Some agents stay always-on.

The host maps connections to agents. The runtime stays client-agnostic. The only new transport piece is a host-stamped connection id in the envelope, used for re-target routing. That is E2's minimum connection/session concept. The host can also author messages to agents for cron-style and background work.

## Decisions, reasons, and tradeoffs

**URL routing over message-content routing.** The host routes on the connection address, never by inspecting payloads. Transport framing stays a transport concern. The frontend stays simple: one connection per tab, no per-message routing logic. Tradeoff: a single tab cannot hold multiple independent session views. Multiple views need multiple connections, which we accept until a use case proves otherwise.

**One connection, several well-known scopes.** A connection is not one topic. It receives its session's event stream plus the workspace-scoped channels (settings, surfaces, keybindings). The host derives that small scope set from the URL. It still never reads a payload. Tradeoff: the host must maintain the scope mapping as connection bookkeeping.

**In-place re-target over URL navigation.** Cutting a connection does not dispose an agent. Agents are runtime-lifetime, not connection-lifetime. Their state is durable in Pi session files and turn state. A URL switch is cold client, warm server, not an app restart. Still, a full reload costs a client re-mount. In-place re-target plus history API updates give smooth switching while the URL stays canonical. Tradeoff: the host holds mutable per-connection binding state. Reconnects re-establish it from the URL, which is why the URL carries the session.

**Per-connection binding, not a global selected session.** This departs from today's runtime, where one selected session is shared by all clients. Per-connection binding makes tabs independent. Tradeoff: the shared selected-session concept dissolves. The driver becomes per-session agent instances with the TTL lifecycle, a real change from today's app-lifetime singleton.

**TTL buys speed, not correctness.** Agent state is durable, so a cold boot restores correctly. The TTL only decides whether the next switch is warm or cold. Teardown must wait for a turn boundary so in-flight work commits first. The 15-second value is a knob, not a law. Always-on agents opt out for host-authored work. Tradeoff: warm agents cost memory, so the TTL is a tunable.

**Host-authored messages.** The host must be a first-class message author for cron and background processing. This is how a mobile user fires a request, locks the phone, and re-attaches on unlock. Tradeoff: agents must accept messages from non-client sources, and the transcript model must handle host-authored entries.

**Multi-agent future unlocks, deliberately not designed.** A ref head on requests would let two agents work different branches of one session. Coordinated agents sharing one session history, and ephemeral call-and-response agents, remain possible. The architecture leaves them open through per-session agent keying and the connection-id envelope. Tradeoff: none now. They are documented, not built, until a use case proves them.

## Log

### 2026-08-08: session and agent host model

Worked out the connection and agent model over the multi-client discussion. Connections are URL-scoped. Session switches re-target in place like a React SPA. Workspace switches are new connections because the client rebuilds. Agents are shared, refcounted, and keyed by workspace-session. First request coalesces the boot promise. Zero connections starts a tunable TTL, with teardown at turn boundaries. Always-on agents plus host-authored messages cover cron and background work. Multi-agent semantics, ref heads, and ephemeral agents are future unlocks recorded in the split plan.
