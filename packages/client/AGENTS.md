---
summary: "Launcher and workspace browser clients: host-neutral UI entries that receive constructed adapters and never detect concrete hosts."
read_when: "Writing shared browser client code, or deciding whether a client capability is host-owned."
---

# Browser clients

Owns the launcher and workspace browser clients: host-neutral UI entries that receive constructed adapters and never detect concrete hosts. The launcher is live. The workspace client follows in the next H5 slice. Each client is mounted by a host-owned bootstrap and hides its current rendering framework behind a disposable DOM mount. Shared code never inspects Electron globals and never selects a transport. It imports author contracts only. Workspace-session targets arrive through canonical URLs, and reconnect recovery is snapshot-backed rather than remounting the client.

<!-- INDEX:START -->

<!-- Generated from each doc's frontmatter by scripts/docs-index.mjs. Do not edit by hand; run `npm run docs:index`. -->

<!-- INDEX:END -->
