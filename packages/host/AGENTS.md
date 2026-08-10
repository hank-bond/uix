---
summary: "Shared host contracts and coordination: the workspace supervisor, workspace handles, and launcher/catalog projection schemas that concrete hosts compose."
read_when: "Writing host-neutral supervision or launcher code that both Electron and server hosts share."
status: stub
---

# Shared host contracts

Empty until H2 proves the host/runtime boundary in memory. This root then owns the workspace supervisor, workspace and attachment handles, and the machine-readable launcher/catalog projection schemas. Concrete Electron and server code never enters this package: `hosts/electron` and `hosts/server` remain the only homes of their platform adapters. The supervisor may import `@uix/runtime` to build local handles, but it never imports `@uix/client` or either concrete host.
