---
summary: "Launcher and workspace browser clients: host-neutral UI entries that receive constructed adapters and never detect concrete hosts."
read_when: "Writing shared browser client code, or deciding whether a client capability is host-owned."
status: stub
---

# Browser clients

Empty until H5 extracts the launcher and workspace UI from `src/renderer`. The shared client has separate launcher and workspace entry surfaces, each mounted by a host-owned bootstrap that supplies a constructed transport client. Shared code never inspects Electron globals and never selects a transport. It imports author contracts only. Workspace-session targets arrive through canonical URLs, and reconnect recovery is snapshot-backed rather than remounting the client.
