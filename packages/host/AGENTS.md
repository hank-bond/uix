---
summary: "Shared host contracts and coordination: the workspace supervisor, workspace and attachment handles, and the launcher/catalog projection schemas that concrete hosts compose."
read_when: "Writing host-neutral supervision or launcher code that both Electron and server hosts share."
---

# Shared host contracts

This package holds the host-neutral coordination both concrete hosts compose. An in-memory suite proved the host/runtime boundary. A supervisor maps workspace ids to single-flight boots and issues independent workspace guards. Each generic guard protects one private workspace owner and provides its operational workspace value, while attachments bind connections to session targets with scoped event routing. Concrete Electron and server code never enters this package: `hosts/electron` and `hosts/server` remain the only homes of their platform adapters. The supervisor may import `@uix/runtime` to build workspaces, but it never imports `@uix/client` or either concrete host.
